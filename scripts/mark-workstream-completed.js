/**
 * Simple script to manually mark a workstream as completed
 *
 * Usage: node scripts/mark-workstream-completed.js <userId> <projectId> <workstreamId>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function markCompleted(userId, projectId, workstreamId) {
  const wsRef = db
    .collection('users').doc(userId)
    .collection('projects').doc(projectId)
    .collection('workstreams').doc(workstreamId);

  const wsDoc = await wsRef.get();
  if (!wsDoc.exists) {
    console.error('❌ Workstream not found');
    return;
  }

  const wsData = wsDoc.data();
  console.log(`Marking workstream "${wsData.name}" as completed...`);

  await wsRef.update({
    status: 'completed',
    mergedAt: admin.firestore.FieldValue.serverTimestamp(),
    actionTag: null
  });

  console.log('✅ Done!');
}

const [userId, projectId, workstreamId] = process.argv.slice(2);

if (!userId || !projectId || !workstreamId) {
  console.error('Usage: node scripts/mark-workstream-completed.js <userId> <projectId> <workstreamId>');
  console.error('');
  console.error('Find these IDs in your browser URL when viewing a workstream:');
  console.error('  /projects/<projectId>/workstreams/<workstreamId>');
  console.error('');
  console.error('Find userId in Firebase Console under Authentication');
  process.exit(1);
}

markCompleted(userId, projectId, workstreamId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
