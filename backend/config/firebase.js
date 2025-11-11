const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let db = null;
let storage = null;
let bucket = null;
let isInitialized = false;

const initializeFirebase = () => {
  try {
    if (isInitialized) {
      console.log('⚠️  Firebase already initialized');
      return { db, storage, bucket };
    }

    // Try to use service account JSON file
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    
    console.log(`🔍 Looking for Firebase credentials at: ${serviceAccountPath}`);
    
    if (fs.existsSync(serviceAccountPath)) {
      console.log('✅ Found firebase-service-account.json');
      
      const serviceAccount = require(serviceAccountPath);
      
      // Validate required fields
      if (!serviceAccount.project_id) {
        throw new Error('Missing project_id in service account JSON');
      }
      if (!serviceAccount.client_email) {
        throw new Error('Missing client_email in service account JSON');
      }
      if (!serviceAccount.private_key) {
        throw new Error('Missing private_key in service account JSON');
      }
      
      console.log(`📦 Project ID: ${serviceAccount.project_id}`);
      console.log(`📧 Client Email: ${serviceAccount.client_email}`);
      
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: `${serviceAccount.project_id}.appspot.com`
        });
        console.log('✅ Firebase Admin SDK initialized');
      }
      
      db = admin.firestore();
      storage = admin.storage();
      bucket = storage.bucket();
      isInitialized = true;
      
      console.log('✅ Firestore initialized');
      console.log('✅ Storage initialized');
      console.log('✅ Firebase ready!\n');
      
      return { db, storage, bucket };
    } 
    // Fallback to environment variables
    else if (process.env.FIREBASE_PROJECT_ID) {
      console.log('📝 Using environment variables for Firebase');
      
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
          }),
          storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
        });
      }
      
      db = admin.firestore();
      storage = admin.storage();
      bucket = storage.bucket();
      isInitialized = true;
      
      console.log('✅ Firebase initialized with environment variables');
      return { db, storage, bucket };
    }

    console.error('❌ Firebase credentials not found!');
    console.error('   Expected file: backend/firebase-service-account.json');
    console.error('   OR environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    
    return { db: null, storage: null, bucket: null };
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    console.error('   Full error:', error);
    return { db: null, storage: null, bucket: null };
  }
};

// Upload CSV to Firebase Storage
const uploadCSVToFirebase = async (csvContent, filename) => {
  try {
    const { bucket } = initializeFirebase();
    if (!bucket) {
      return { success: false, error: 'Firebase Storage not initialized' };
    }

    const file = bucket.file(`exports/${filename}`);
    
    await file.save(csvContent, {
      metadata: {
        contentType: 'text/csv',
        metadata: {
          uploadedAt: new Date().toISOString()
        }
      }
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/exports/${filename}`;

    console.log(`✅ CSV uploaded to Firebase Storage: ${filename}`);
    return { 
      success: true, 
      url: publicUrl,
      filename,
      message: 'CSV uploaded to cloud storage'
    };
  } catch (error) {
    console.error('❌ Error uploading to Firebase Storage:', error);
    return { success: false, error: error.message };
  }
};

// List all uploaded CSVs
const listCSVFiles = async () => {
  try {
    const { bucket } = initializeFirebase();
    if (!bucket) {
      return { success: false, error: 'Firebase Storage not initialized' };
    }

    const [files] = await bucket.getFiles({ prefix: 'exports/' });
    
    const csvFiles = await Promise.all(
      files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        return {
          name: file.name,
          size: metadata.size,
          created: metadata.timeCreated,
          url: `https://storage.googleapis.com/${bucket.name}/${file.name}`
        };
      })
    );

    return { success: true, files: csvFiles };
  } catch (error) {
    console.error('❌ Error listing CSV files:', error);
    return { success: false, error: error.message };
  }
};

// Delete CSV file
const deleteCSVFile = async (filename) => {
  try {
    const { bucket } = initializeFirebase();
    if (!bucket) {
      return { success: false, error: 'Firebase Storage not initialized' };
    }

    await bucket.file(`exports/${filename}`).delete();

    console.log(`✅ CSV deleted from Firebase Storage: ${filename}`);
    return { success: true, message: 'File deleted successfully' };
  } catch (error) {
    console.error('❌ Error deleting CSV file:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  initializeFirebase,
  uploadCSVToFirebase,
  listCSVFiles,
  deleteCSVFile,
  getDb: () => db,
  getStorage: () => storage,
  getBucket: () => bucket
};