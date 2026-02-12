/**
 * Backfill script to mark already-merged branches as completed
 *
 * This queries GitHub to check if branches still exist. If a branch
 * doesn't exist on GitHub but has a workstream in Firestore, it was
 * likely merged and we should mark it as completed.
 *
 * Usage: node scripts/backfill-merged-workstreams.js <userId>
 */

const admin = require('firebase-admin');
const { Octokit } = require('@octokit/rest');

// Initialize Firebase Admin
const serviceAccount = require('../functions/service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// You'll need a GitHub token with repo access
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable required');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function checkBranchExists(owner, repo, branch) {
  try {
    await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch
    });
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

async function backfillMergedWorkstreams(userId) {
  console.log(`Backfilling merged workstreams for user ${userId}...`);

  const projectsRef = db.collection('users').doc(userId).collection('projects');
  const projectsSnap = await projectsRef.get();

  let totalChecked = 0;
  let totalMarkedCompleted = 0;

  for (const projectDoc of projectsSnap.docs) {
    const projectData = projectDoc.data();
    const projectName = projectData.name;
    const fullName = projectData.fullName || projectName;

    // Parse owner/repo from fullName (e.g., "goggledefogger/town-center")
    const [owner, repo] = fullName.includes('/')
      ? fullName.split('/')
      : [null, projectName];

    if (!owner || !repo) {
      console.log(`⚠️  Skipping ${projectName} - cannot parse owner/repo`);
      continue;
    }

    console.log(`\nChecking project: ${owner}/${repo}`);

    const workstreamsRef = projectDoc.ref.collection('workstreams');
    const workstreamsSnap = await workstreamsRef.where('status', '==', 'active').get();

    for (const wsDoc of workstreamsSnap.docs) {
      const wsData = wsDoc.data();
      const branchName = wsData.name;
      totalChecked++;

      const exists = await checkBranchExists(owner, repo, branchName);

      if (!exists) {
        console.log(`  ✓ Branch "${branchName}" doesn't exist on GitHub - marking as completed`);
        await wsDoc.ref.update({
          status: 'completed',
          mergedAt: admin.firestore.FieldValue.serverTimestamp(),
          actionTag: null
        });
        totalMarkedCompleted++;
      } else {
        console.log(`  - Branch "${branchName}" still exists (active)`);
      }

      // Rate limit: wait 100ms between GitHub API calls
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Checked: ${totalChecked} active workstreams`);
  console.log(`   Marked completed: ${totalMarkedCompleted} workstreams`);
}

// Get userId from command line
const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/backfill-merged-workstreams.js <userId>');
  console.error('Find your userId in the Firebase Console or from your dashboard URL');
  process.exit(1);
}

backfillMergedWorkstreams(userId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
