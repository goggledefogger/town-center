const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'town-center-agent'
});

const db = admin.firestore();

const projectNameToDelete = process.argv[2];

if (!projectNameToDelete) {
  console.error('Usage: node delete-project.js <project-name>');
  process.exit(1);
}

async function deleteProject() {
  console.log(`Looking for project: ${projectNameToDelete}...`);

  const usersSnapshot = await db.collection('users').limit(10).get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const projectsRef = db.collection('users').doc(userId).collection('projects');
    const projectQuery = await projectsRef.where('name', '==', projectNameToDelete).limit(1).get();

    if (!projectQuery.empty) {
      const projectDoc = projectQuery.docs[0];
      console.log(`Found project in user ${userId}: ${projectDoc.id}`);

      // Delete all workstreams and their updates
      const workstreamsSnapshot = await projectDoc.ref.collection('workstreams').get();
      console.log(`Deleting ${workstreamsSnapshot.size} workstreams...`);

      for (const wsDoc of workstreamsSnapshot.docs) {
        const updatesSnapshot = await wsDoc.ref.collection('updates').get();
        console.log(`  Deleting ${updatesSnapshot.size} updates from ${wsDoc.data().name}...`);

        for (const updateDoc of updatesSnapshot.docs) {
          await updateDoc.ref.delete();
        }

        await wsDoc.ref.delete();
      }

      // Delete the project
      await projectDoc.ref.delete();
      console.log(`✅ Deleted project: ${projectNameToDelete}`);
      process.exit(0);
    }
  }

  console.log(`❌ Project not found: ${projectNameToDelete}`);
  process.exit(1);
}

deleteProject().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
