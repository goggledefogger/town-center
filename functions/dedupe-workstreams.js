const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'town-center-agent'
});

const db = admin.firestore();

async function dedupeWorkstreams() {
  console.log('Finding duplicate workstreams...\n');

  const usersSnapshot = await db.collection('users').limit(10).get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    console.log(`Checking user: ${userId}`);

    const projectsSnapshot = await db.collection('users').doc(userId).collection('projects').get();

    for (const projectDoc of projectsSnapshot.docs) {
      const projectName = projectDoc.data().name;
      const workstreamsRef = projectDoc.ref.collection('workstreams');
      const workstreamsSnapshot = await workstreamsRef.get();

      // Group workstreams by normalized name
      const byNormalizedName = {};

      for (const wsDoc of workstreamsSnapshot.docs) {
        const wsData = wsDoc.data();
        const normalizedName = wsData.name.replace(/^refs\/heads\//, '');

        if (!byNormalizedName[normalizedName]) {
          byNormalizedName[normalizedName] = [];
        }

        byNormalizedName[normalizedName].push({
          id: wsDoc.id,
          ref: wsDoc.ref,
          data: wsData
        });
      }

      // Find duplicates
      for (const [normalizedName, workstreams] of Object.entries(byNormalizedName)) {
        if (workstreams.length > 1) {
          console.log(`\n⚠️  Found ${workstreams.length} duplicates for branch: ${normalizedName} in project: ${projectName}`);

          // Sort by lastActivityAt (newest first)
          workstreams.sort((a, b) => {
            const aTime = a.data.lastActivityAt?.toDate?.() || new Date(0);
            const bTime = b.data.lastActivityAt?.toDate?.() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });

          const keepWorkstream = workstreams[0];
          const deleteWorkstreams = workstreams.slice(1);

          console.log(`  ✅ Keeping: ${keepWorkstream.data.name} (ID: ${keepWorkstream.id})`);
          console.log(`     Status: ${keepWorkstream.data.status}, Last activity: ${keepWorkstream.data.lastActivityAt?.toDate?.()}`);

          for (const ws of deleteWorkstreams) {
            console.log(`  ❌ Deleting: ${ws.data.name} (ID: ${ws.id})`);
            console.log(`     Status: ${ws.data.status}, Last activity: ${ws.data.lastActivityAt?.toDate?.()}`);

            // Move updates from old workstream to the one we're keeping
            const updatesSnapshot = await ws.ref.collection('updates').get();
            console.log(`     Moving ${updatesSnapshot.size} updates...`);

            for (const updateDoc of updatesSnapshot.docs) {
              const updateData = updateDoc.data();
              await keepWorkstream.ref.collection('updates').add(updateData);
            }

            // Delete old workstream
            await ws.ref.delete();
          }

          // Update the kept workstream to use normalized name
          if (keepWorkstream.data.name !== normalizedName) {
            console.log(`  🔧 Normalizing name to: ${normalizedName}`);
            await keepWorkstream.ref.update({ name: normalizedName });
          }
        }
      }
    }
  }

  console.log('\n✅ Deduplication complete!');
  process.exit(0);
}

dedupeWorkstreams().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
