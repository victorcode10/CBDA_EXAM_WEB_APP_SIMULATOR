const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { initializeFirebase, uploadCSVToFirebase, listCSVFiles, deleteCSVFile } = require('./config/firebase');

const app = express();

// Initialize Firebase
const { db } = initializeFirebase();

if (!db) {
  console.warn('⚠️  Firestore not initialized - check Firebase credentials');
}

// IMPORTANT: Set port from environment or default
const PORT = process.env.PORT || 5000;

// CORS configuration for production
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-app-name.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize default admin user (only if Firestore is empty)
const initializeAdmin = async () => {
  if (!db) return;

  try {
    const usersSnapshot = await db.collection('users').limit(1).get();
    
    if (usersSnapshot.empty) {
      const defaultUsers = [
        {
          id: 'admin_001',
          name: 'Admin User',
          email: 'victor@blossom.africa',
          password: bcrypt.hashSync('admin123', 10),
          role: 'admin',
          createdAt: new Date().toISOString(),
          verified: true
        },
        {
          id: 'student_001',
          name: 'Victor Bolade',
          email: 'victorboladea@gmail.com',
          password: bcrypt.hashSync('student123', 10),
          role: 'student',
          createdAt: new Date().toISOString(),
          verified: true
        }
      ];

      const batch = db.batch();
      defaultUsers.forEach(user => {
        const docRef = db.collection('users').doc(user.id);
        batch.set(docRef, user);
      });
      await batch.commit();

      console.log('✅ Default users created in Firestore');
    }
  } catch (error) {
    console.error('Error initializing admin:', error.message);
  }
};

initializeAdmin();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON and image files are allowed'));
    }
  }
});

// ==================== AUTHENTICATION ROUTES ====================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const usersSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

    if (usersSnapshot.empty) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const userDoc = usersSnapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };

    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, verified } = req.body;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    // Check if user exists
    const existingUser = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existingUser.empty) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const newUser = {
      id: `student_${Date.now()}`,
      name,
      email,
      password: bcrypt.hashSync(password, 10),
      role: 'student',
      createdAt: new Date().toISOString(),
      verified: verified || false
    };

    await db.collection('users').doc(newUser.id).set(newUser);

    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Change Email
app.post('/api/auth/change-email', async (req, res) => {
  try {
    const { userId, newEmail, verified } = req.body;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    if (verified === false) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email change must be verified first' 
      });
    }

    // Check if new email already exists
    const existingEmail = await db.collection('users').where('email', '==', newEmail).limit(1).get();
    if (!existingEmail.empty && existingEmail.docs[0].id !== userId) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await userRef.update({ email: newEmail });

    res.json({ success: true, message: 'Email updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== QUESTION ROUTES ====================

// Upload questions
app.post('/api/questions/upload/:testType/:testId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { testType, testId } = req.params;
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    let questions;

    try {
      questions = JSON.parse(fileContent);
    } catch (parseError) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }

    if (!Array.isArray(questions)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: 'Questions must be an array' });
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.id || !q.question || !Array.isArray(q.options) || 
          q.options.length !== 4 || typeof q.correctAnswer !== 'number') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          success: false, 
          error: `Invalid question format at index ${i}` 
        });
      }
    }

    if (testType === 'mock' && questions.length < 75) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        success: false, 
        error: `Mock exams must have at least 75 questions. Uploaded: ${questions.length}` 
      });
    }

    await db.collection('questions').doc(`${testType}_${testId}`).set({
      testType,
      testId,
      questions,
      questionCount: questions.length,
      createdAt: new Date().toISOString()
    });

    fs.unlinkSync(req.file.path);

    console.log(`✅ ${questions.length} questions uploaded for ${testType} ${testId}`);
    res.json({ 
      success: true, 
      message: 'Questions uploaded successfully',
      count: questions.length,
      testType,
      testId
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get questions
app.get('/api/questions/:testType/:testId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { testType, testId } = req.params;
    const docRef = db.collection('questions').doc(`${testType}_${testId}`);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Questions not found for this test' 
      });
    }

    const data = doc.data();
    const shuffled = data.questions.sort(() => Math.random() - 0.5);
    const limitedQuestions = testType === 'mock' ? shuffled.slice(0, 75) : shuffled;

    res.json({ 
      success: true, 
      questions: limitedQuestions,
      count: limitedQuestions.length 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available tests
app.get('/api/questions/available', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const snapshot = await db.collection('questions').get();
    const availableTests = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        testType: data.testType,
        testId: data.testId,
        questionCount: data.questionCount,
        filename: doc.id
      };
    });

    res.json({ success: true, tests: availableTests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RESULTS ROUTES ====================

// Save result
app.post('/api/results', async (req, res) => {
  try {
    const result = req.body;

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    if (!result.userName || !result.testName || result.score === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const newResult = {
      ...result,
      id: `result_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    await db.collection('results').doc(newResult.id).set(newResult);

    console.log(`✅ Result saved: ${result.userName} - ${result.testName} - ${result.score}%`);
    res.json({ success: true, resultId: newResult.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user results
app.get('/api/results/user/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { userId } = req.params;
    const snapshot = await db.collection('results')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();

    const results = snapshot.docs.map(doc => doc.data());

    res.json({ success: true, results, count: results.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all results (admin)
app.get('/api/results/admin/all', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const snapshot = await db.collection('results').orderBy('timestamp', 'desc').get();
    const results = snapshot.docs.map(doc => doc.data());

    const stats = {
      totalTests: results.length,
      uniqueStudents: [...new Set(results.map(r => r.userId))].length,
      averageScore: results.length > 0 
        ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length) 
        : 0,
      passRate: results.length > 0
        ? Math.round((results.filter(r => r.score >= 70).length / results.length) * 100)
        : 0
    };

    res.json({ success: true, results, count: results.length, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export CSV
app.get('/api/results/export/csv', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const snapshot = await db.collection('results').get();
    const results = snapshot.docs.map(doc => doc.data());

    let csv = 'ID,User Name,User Email,Test Name,Test Type,Score (%),Date,Time Taken,Total Questions,Correct Answers,User ID,Timestamp\n';

    results.forEach(r => {
      csv += `"${r.id}","${r.userName}","${r.userEmail || 'N/A'}","${r.testName}","${r.testType || 'N/A'}",${r.score},"${r.date}","${r.timeTaken}",${r.totalQuestions},${r.correctAnswers},"${r.userId}","${r.timestamp}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=cbda-results-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export to cloud
app.get('/api/results/export/csv-cloud', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const snapshot = await db.collection('results').get();
    const results = snapshot.docs.map(doc => doc.data());

    let csv = 'ID,User Name,User Email,Test Name,Test Type,Score (%),Date,Time Taken,Total Questions,Correct Answers,User ID,Timestamp\n';

    results.forEach(r => {
      csv += `"${r.id}","${r.userName}","${r.userEmail || 'N/A'}","${r.testName}","${r.testType || 'N/A'}",${r.score},"${r.date}","${r.timeTaken}",${r.totalQuestions},${r.correctAnswers},"${r.userId}","${r.timestamp}"\n`;
    });

    const filename = `cbda-results-${Date.now()}.csv`;
    const uploadResult = await uploadCSVToFirebase(csv, filename);

    if (uploadResult.success) {
      res.json({
        success: true,
        message: 'CSV uploaded to cloud storage',
        url: uploadResult.url,
        filename: uploadResult.filename
      });
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List CSV files
app.get('/api/results/csv-files', async (req, res) => {
  try {
    const result = await listCSVFiles();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete CSV
app.delete('/api/results/csv-cloud/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const result = await deleteCSVFile(filename);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete result
app.delete('/api/results/:resultId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { resultId } = req.params;
    await db.collection('results').doc(resultId).delete();

    res.json({ success: true, message: 'Result deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// Get users
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => {
      const { password, ...user } = doc.data();
      return user;
    });

    res.json({ success: true, users, count: users.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const [usersSnapshot, resultsSnapshot, questionsSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('results').get(),
      db.collection('questions').get()
    ]);

    const users = usersSnapshot.docs.map(doc => doc.data());
    const results = resultsSnapshot.docs.map(doc => doc.data());
    const questions = questionsSnapshot.docs.map(doc => doc.data());

    const stats = {
      totalStudents: users.filter(u => u.role === 'student').length,
      totalTests: results.length,
      averageScore: results.length > 0 
        ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length) 
        : 0,
      passRate: results.length > 0
        ? Math.round((results.filter(r => r.score >= 70).length / results.length) * 100)
        : 0,
      totalQuestions: questions.reduce((acc, q) => acc + q.questionCount, 0),
      availableTests: questions.length
    };

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server running', 
    timestamp: new Date().toISOString(),
    storage: db ? 'Firebase Firestore' : 'Not connected',
    database: db ? 'Connected' : 'Disconnected'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 ========================================`);
  console.log(`   CBDA Exam Simulator Backend`);
  console.log(`   ========================================`);
  console.log(`   ✅ Server running on http://localhost:${PORT}`);
  console.log(`   💾 Storage: ${db ? 'Firebase Firestore ✅' : 'Not connected ❌'}`);
  console.log(`   📁 Database: ${db ? 'Connected' : 'Check credentials'}`);
  console.log(`   ========================================\n`);
});