const fs = require('fs');
const path = require('path');
const { initializeFirebase } = require('./config/firebase');

const migrateToFirestore = async () => {
  console.log('🚀 Starting migration to Firestore...\n');

  const { db } = initializeFirebase();
  
  if (!db) {
    console.error('❌ Firebase not initialized. Check your credentials.');
    process.exit(1);
  }

  try {
    // Migrate Users
    const usersPath = path.join(__dirname, 'data', 'users.json');
    if (fs.existsSync(usersPath)) {
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      console.log(`📤 Migrating ${users.length} users...`);
      
      const batch = db.batch();
      users.forEach(user => {
        const docRef = db.collection('users').doc(user.id);
        batch.set(docRef, user);
      });
      await batch.commit();
      
      console.log(`✅ ${users.length} users migrated successfully\n`);
    }

    // Migrate Results
    const resultsPath = path.join(__dirname, 'data', 'results', 'all_results.json');
    if (fs.existsSync(resultsPath)) {
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      console.log(`📤 Migrating ${results.length} results...`);
      
      // Batch write (max 500 per batch)
      for (let i = 0; i < results.length; i += 500) {
        const batch = db.batch();
        const chunk = results.slice(i, i + 500);
        
        chunk.forEach(result => {
          const docRef = db.collection('results').doc(result.id);
          batch.set(docRef, result);
        });
        
        await batch.commit();
        console.log(`✅ Batch ${Math.floor(i / 500) + 1} complete (${chunk.length} results)`);
      }
      
      console.log(`✅ ${results.length} results migrated successfully\n`);
    }

    // Migrate Questions
    const questionsDir = path.join(__dirname, 'data', 'questions');
    if (fs.existsSync(questionsDir)) {
      const files = fs.readdirSync(questionsDir).filter(f => f.endsWith('.json'));
      console.log(`📤 Migrating ${files.length} question sets...`);
      
      for (const file of files) {
        const [testType, testId] = file.replace('.json', '').split('_');
        const questions = JSON.parse(fs.readFileSync(path.join(questionsDir, file), 'utf8'));
        
        const docRef = db.collection('questions').doc(`${testType}_${testId}`);
        await docRef.set({
          testType,
          testId,
          questions,
          questionCount: questions.length,
          createdAt: new Date().toISOString()
        });
        
        console.log(`✅ ${file} migrated (${questions.length} questions)`);
      }
      
      console.log(`✅ ${files.length} question sets migrated successfully\n`);
    }

    console.log('🎉 Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - Users: Migrated to Firestore collection 'users'`);
    console.log(`   - Results: Migrated to Firestore collection 'results'`);
    console.log(`   - Questions: Migrated to Firestore collection 'questions'`);
    console.log('\n✅ You can now delete the data/ folder (backup first!)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrateToFirestore();