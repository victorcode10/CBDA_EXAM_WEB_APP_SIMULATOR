import React, { useState, useEffect } from 'react';
import { 
  LogOut, Menu, X, Users, FileText, BarChart3, 
  Download, Trash2, CheckCircle, AlertCircle, User, Target, Cloud
} from 'lucide-react';
import mammoth from 'mammoth';
import { API_ENDPOINTS } from '../config/app';

const AdminDashboard = ({ user, onLogout }) => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [allResults, setAllResults] = useState([]);
  const [users, setUsers] = useState([]);
  const [availableTests, setAvailableTests] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cloudFiles, setCloudFiles] = useState([]);
  const [showCloudFiles, setShowCloudFiles] = useState(false);

  useEffect(() => {
    loadStats();
    loadAllResults();
    loadUsers();
    loadAvailableTests();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.getStats);
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadAllResults = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.getAllResults);
      const data = await response.json();
      if (data.success) {
        setAllResults(data.results);
      }
    } catch (error) {
      console.error('Error loading results:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.getUsers);
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadAvailableTests = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.availableTests);
      const data = await response.json();
      if (data.success) {
        setAvailableTests(data.tests);
      }
    } catch (error) {
      console.error('Error loading tests:', error);
    }
  };

  const loadCloudFiles = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.csvFiles);
      const data = await response.json();
      if (data.success) {
        setCloudFiles(data.files);
      }
    } catch (error) {
      console.error('Error loading cloud files:', error);
    }
  };

  const convertWordToJSON = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      const questionBlocks = text.split(/Question \d+:/i).filter(block => block.trim());
      const questions = [];

      questionBlocks.forEach((block, index) => {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        
        if (lines.length < 6) return;

        const questionText = lines[0];
        const options = [];
        let correctAnswer = 0;
        let domain = 'General';
        let difficulty = 'medium';

        lines.forEach((line) => {
          if (line.match(/^[A-D]\)/i)) {
            options.push(line.substring(2).trim());
          }
          if (line.toLowerCase().startsWith('answer:')) {
            const answer = line.split(':')[1].trim().toUpperCase();
            correctAnswer = answer.charCodeAt(0) - 'A'.charCodeAt(0);
          }
          if (line.toLowerCase().startsWith('domain:')) {
            domain = line.split(':')[1].trim();
          }
          if (line.toLowerCase().startsWith('difficulty:')) {
            difficulty = line.split(':')[1].trim().toLowerCase();
          }
        });

        if (options.length === 4 && questionText) {
          questions.push({
            id: index + 1,
            question: questionText,
            options,
            correctAnswer,
            domain,
            difficulty
          });
        }
      });

      return questions;
    } catch (error) {
      console.error('Error converting Word to JSON:', error);
      throw error;
    }
  };

  const handleQuestionUpload = async (e, testType, testId) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setUploadStatus(null);

    try {
      let questions;

      if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        setUploadStatus({ type: 'info', message: 'Converting Word document to JSON...' });
        questions = await convertWordToJSON(file);
        
        if (questions.length === 0) {
          throw new Error('No valid questions found in document');
        }

        const jsonBlob = new Blob([JSON.stringify(questions)], { type: 'application/json' });
        const jsonFile = new File([jsonBlob], file.name.replace(/\.docx?$/, '.json'), { type: 'application/json' });
        
        const formData = new FormData();
        formData.append('file', jsonFile);

        const response = await fetch(API_ENDPOINTS.uploadQuestions(testType, testId), {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          setUploadStatus({ type: 'success', message: `${data.count} questions uploaded successfully from Word document!` });
          loadAvailableTests();
          loadStats();
        } else {
          setUploadStatus({ type: 'error', message: data.error });
        }
      } else if (file.name.endsWith('.json')) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(API_ENDPOINTS.uploadQuestions(testType, testId), {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          setUploadStatus({ type: 'success', message: `${data.count} questions uploaded successfully!` });
          loadAvailableTests();
          loadStats();
        } else {
          setUploadStatus({ type: 'error', message: data.error });
        }
      } else {
        setUploadStatus({ type: 'error', message: 'Please upload a JSON or Word document (.docx)' });
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message || 'Upload failed. Please try again.' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleExportCSV = () => {
    window.open(API_ENDPOINTS.exportCSV, '_blank');
  };

  const handleExportToCloud = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.exportCSVCloud);
      const data = await response.json();
      
      if (data.success) {
        setUploadStatus({ 
          type: 'success', 
          message: `CSV uploaded to cloud! Access it anytime from View Cloud Files.` 
        });
        loadCloudFiles();
      } else {
        setUploadStatus({ type: 'error', message: 'Cloud upload failed. File downloaded locally.' });
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: 'Export failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteResult = async (resultId) => {
    if (!window.confirm('Are you sure you want to delete this result?')) return;

    try {
      const response = await fetch(API_ENDPOINTS.deleteResult(resultId), {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        setUploadStatus({ type: 'success', message: 'Result deleted successfully!' });
        loadAllResults();
        loadStats();
      } else {
        setUploadStatus({ type: 'error', message: data.error });
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: 'Delete failed.' });
    }
  };

  const handleDeleteCloudFile = async (filename) => {
    if (!window.confirm('Delete this file from cloud storage?')) return;
    
    try {
      const response = await fetch(API_ENDPOINTS.deleteCSVCloud(filename), {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (data.success) {
        setUploadStatus({ type: 'success', message: 'File deleted from cloud' });
        loadCloudFiles();
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: 'Delete failed' });
    }
  };

  const Header = () => (
    <header className="bg-gradient-to-r from-purple-600 to-indigo-800 text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-12 w-auto rounded-lg shadow-md"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="bg-white text-purple-600 px-4 py-2 rounded-lg font-bold text-xl shadow-md hidden">
              CBDA Academy
            </div>
            <div className="hidden md:block">
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-purple-100 text-sm">Manage exams and monitor performance</p>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-6">
            <button onClick={() => setCurrentPage('dashboard')} className="hover:text-purple-200 transition">
              Dashboard
            </button>
            <button onClick={() => setCurrentPage('questions')} className="hover:text-purple-200 transition">
              Manage Questions
            </button>
            <button onClick={() => setCurrentPage('results')} className="hover:text-purple-200 transition">
              View Results
            </button>
            <button onClick={() => setCurrentPage('students')} className="hover:text-purple-200 transition">
              Students
            </button>
            <button onClick={onLogout} className="hover:text-purple-200 transition flex items-center space-x-2">
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>

          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden">
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden mt-4 space-y-2 pb-4">
            <button onClick={() => { setCurrentPage('dashboard'); setMenuOpen(false); }} className="block w-full text-left py-2 hover:bg-purple-700 px-4 rounded">Dashboard</button>
            <button onClick={() => { setCurrentPage('questions'); setMenuOpen(false); }} className="block w-full text-left py-2 hover:bg-purple-700 px-4 rounded">Manage Questions</button>
            <button onClick={() => { setCurrentPage('results'); setMenuOpen(false); }} className="block w-full text-left py-2 hover:bg-purple-700 px-4 rounded">View Results</button>
            <button onClick={() => { setCurrentPage('students'); setMenuOpen(false); }} className="block w-full text-left py-2 hover:bg-purple-700 px-4 rounded">Students</button>
            <button onClick={() => { onLogout(); setMenuOpen(false); }} className="block w-full text-left py-2 hover:bg-purple-700 px-4 rounded">Logout</button>
          </div>
        )}
      </div>
    </header>
  );

  const DashboardPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {user.name}</h2>
          <p className="text-gray-600">Administrator Dashboard</p>
        </div>

        {uploadStatus && (
          <div className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${
            uploadStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
            uploadStatus.type === 'info' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {uploadStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span>{uploadStatus.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Users className="text-blue-600" size={32} />
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-800">{stats.totalStudents || 0}</div>
                <div className="text-gray-600">Total Students</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center space-x-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <FileText className="text-green-600" size={32} />
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-800">{stats.totalTests || 0}</div>
                <div className="text-gray-600">Tests Completed</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center space-x-4">
              <div className="bg-purple-100 p-3 rounded-lg">
                <BarChart3 className="text-purple-600" size={32} />
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-800">{stats.averageScore || 0}%</div>
                <div className="text-gray-600">Avg Score</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center space-x-4">
              <div className="bg-orange-100 p-3 rounded-lg">
                <Target className="text-orange-600" size={32} />
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-800">{stats.passRate || 0}%</div>
                <div className="text-gray-600">Pass Rate</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Available Tests</h3>
            <div className="text-4xl font-bold text-blue-600 mb-2">{stats.availableTests || 0}</div>
            <p className="text-gray-600">Question sets uploaded</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Total Questions</h3>
            <div className="text-4xl font-bold text-green-600 mb-2">{stats.totalQuestions || 0}</div>
            <p className="text-gray-600">Questions in database</p>
          </div>
        </div>
      </div>
    </div>
  );

  const QuestionsPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Manage Questions</h2>

          {uploadStatus && (
            <div className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${
              uploadStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
              uploadStatus.type === 'info' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {uploadStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <span>{uploadStatus.message}</span>
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Chapter-wise Tests</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { id: 1, name: 'Identify the research questions' },
                { id: 2, name: 'Source data' },
                { id: 3, name: 'Analyze data' },
                { id: 4, name: 'Interpret and report results' },
                { id: 5, name: 'Use results to influence business decision-making' },
                { id: 6, name: 'Guide organizational-level strategy for business analytics' }
              ].map(chapter => {
                const test = availableTests.find(t => t.testType === 'chapter' && t.testId === chapter.id.toString());
                return (
                  <div key={chapter.id} className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800">{chapter.name}</h4>
                      {test && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full flex items-center space-x-1">
                          <CheckCircle size={12} />
                          <span>{test.questionCount} Qs</span>
                        </span>
                      )}
                    </div>
                    <input
                      type="file"
                      accept=".json,.docx,.doc"
                      onChange={(e) => handleQuestionUpload(e, 'chapter', chapter.id)}
                      disabled={loading}
                      className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">JSON or Word (.docx)</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Mock Exams (75 questions each)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(mockId => {
                const test = availableTests.find(t => t.testType === 'mock' && t.testId === mockId.toString());
                return (
                  <div key={mockId} className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800">Mock Exam {mockId}</h4>
                      {test && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full flex items-center space-x-1">
                          <CheckCircle size={12} />
                          <span>{test.questionCount} Qs</span>
                        </span>
                      )}
                    </div>
                    <input
                      type="file"
                      accept=".json,.docx,.doc"
                      onChange={(e) => handleQuestionUpload(e, 'mock', mockId)}
                      disabled={loading}
                      className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 transition disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">JSON or Word (.docx)</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-6 border-2 border-amber-200">
            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center space-x-2">
              <FileText size={20} className="text-amber-600" />
              <span>Word Document Format (.docx)</span>
            </h3>
            <div className="bg-white p-4 rounded-lg">
              <pre className="text-xs overflow-x-auto">Question 1: What is data governance?
A) Storing data
B) Managing data quality and compliance
C) Deleting data
D) Encrypting data
Answer: B
Domain: Data Governance
Difficulty: medium

Question 2: What does ETL stand for?
A) Extract, Transform, Load
B) Evaluate, Test, Launch
C) Execute, Track, Log
D) Estimate, Transfer, Link
Answer: A
Domain: Data Analysis
Difficulty: easy</pre>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              <strong>Format Requirements:</strong> Each question must have: Question number, Question text,
              4 options (A-D), Answer (A/B/C/D), Domain, and Difficulty (easy/medium/hard)
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const ResultsPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <h2 className="text-3xl font-bold text-gray-800">All Test Results</h2>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleExportCSV}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition flex items-center space-x-2"
              >
                <Download size={20} />
                <span>Download CSV</span>
              </button>
              <button
                onClick={handleExportToCloud}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition flex items-center space-x-2 disabled:opacity-50"
              >
                <Cloud size={20} />
                <span>Upload to Cloud</span>
              </button>
              <button
                onClick={() => {
                  setShowCloudFiles(!showCloudFiles);
                  if (!showCloudFiles) loadCloudFiles();
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition flex items-center space-x-2"
              >
                <Cloud size={20} />
                <span>View Cloud Files</span>
              </button>
            </div>
          </div>

          {uploadStatus && (
            <div
              className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${
                uploadStatus.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {uploadStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <span>{uploadStatus.message}</span>
            </div>
          )}

          {showCloudFiles && (
            <div className="mb-6 bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center space-x-2">
                <Cloud size={24} className="text-purple-600" />
                <span>Cloud Storage Files</span>
              </h3>
              {cloudFiles.length === 0 ? (
                <p className="text-gray-600">No files in cloud storage yet. Upload results to get started!</p>
              ) : (
                <div className="space-y-3">
                  {cloudFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white p-4 rounded-lg border border-purple-200">
                      <div>
                        <p className="font-medium text-gray-800">{file.name.replace('exports/', '')}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(file.created).toLocaleString()} • {Math.round(file.size / 1024)} KB
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 transition text-sm font-medium"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => handleDeleteCloudFile(file.name.replace('exports/', ''))}
                          className="bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 transition text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {allResults.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 size={64} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No test results yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Student</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Test Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Score</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Time Taken</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Correct</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allResults.map((result, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-800">{result.userName}</div>
                        <div className="text-xs text-gray-500">{result.userEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{result.testName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                            result.score >= 70 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {result.score}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{result.date}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{result.timeTaken}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{result.correctAnswers}/{result.totalQuestions}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteResult(result.id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete result"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const StudentsPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Registered Students</h2>
          {users.length === 0 ? (
            <div className="text-center py-12">
              <Users size={64} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No students registered yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users
                .filter((u) => u.role === 'student')
                .map((student, index) => {
                  const studentResults = allResults.filter((r) => r.userId === student.id);
                  const avgScore =
                    studentResults.length > 0
                      ? Math.round(
                          studentResults.reduce((acc, r) => acc + r.score, 0) / studentResults.length
                        )
                      : 0;

                  return (
                    <div
                      key={index}
                      className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 hover:shadow-lg transition"
                    >
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                          <User className="text-white" size={24} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800">{student.name}</h3>
                          <p className="text-xs text-gray-600">{student.email}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Tests Taken:</span>
                          <span className="font-semibold text-gray-800">{studentResults.length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Avg Score:</span>
                          <span className={`font-semibold ${avgScore >= 70 ? 'text-green-600' : 'text-orange-600'}`}>
                            {avgScore}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Joined:</span>
                          <span className="text-xs text-gray-500">{new Date(student.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'questions' && <QuestionsPage />}
      {currentPage === 'results' && <ResultsPage />}
      {currentPage === 'students' && <StudentsPage />}
    </div>
  );
};

export default AdminDashboard;