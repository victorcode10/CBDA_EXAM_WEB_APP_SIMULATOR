import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus, Shield } from 'lucide-react';
import emailService from '../utils/emailService';
import { API_ENDPOINTS } from '../config/app';

const Login = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationStep, setVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingUser, setPendingUser] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await fetch(API_ENDPOINTS.login, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
          if (!data.user.verified) {
            setError('Please verify your email first. Check your inbox for verification code.');
            setVerificationStep(true);
            setPendingUser(data.user);
          } else {
            localStorage.setItem('isVerified', 'true');
            onLogin(data.user);
          }
        } else {
          setError(data.error || 'Authentication failed');
        }
      } else {
        const code = emailService.generateVerificationCode();
        const emailResult = await emailService.sendVerificationEmail(email, name, code);

        if (emailResult.success) {
          emailService.storeVerificationCode(email, code);
          setPendingUser({ name, email, password });
          setVerificationStep(true);
          setError('');
        } else {
          setError('Failed to send verification email. Please try again.');
        }
      }
    } catch (error) {
      setError('Connection error. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isValid = emailService.verifyCode(pendingUser.email, verificationCode);

      if (!isValid) {
        setError('Invalid or expired verification code');
        setLoading(false);
        return;
      }

      if (isLogin) {
        onLogin({ ...pendingUser, verified: true });
        localStorage.setItem('isVerified', 'true');
      } else {
        const response = await fetch(API_ENDPOINTS.register, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: pendingUser.name,
            email: pendingUser.email,
            password: pendingUser.password,
            verified: true
          })
        });

        const data = await response.json();

        if (data.success) {
          onLogin(data.user);
          localStorage.setItem('isVerified', 'true');
        } else {
          setError(data.error || 'Registration failed');
        }
      }
    } catch (error) {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    const code = emailService.generateVerificationCode();
    const emailResult = await emailService.sendVerificationEmail(
      pendingUser.email,
      pendingUser.name,
      code
    );

    if (emailResult.success) {
      emailService.storeVerificationCode(pendingUser.email, code);
      setError('');
      alert('New verification code sent!');
    } else {
      setError('Failed to resend code');
    }
    setLoading(false);
  };

  if (verificationStep) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-blue-600 text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Mail size={32} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Check Your Email</h1>
            <p className="text-gray-600 mt-2">
              We sent a verification code to<br />
              <strong>{pendingUser.email}</strong>
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <form onSubmit={handleVerification} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength="6"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
              >
                {loading ? (
                  <div className="spinner border-white"></div>
                ) : (
                  <>
                    <Shield size={20} />
                    <span>Verify & Continue</span>
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={loading}
                  className="text-sm text-blue-600 hover:text-blue-700 transition disabled:opacity-50"
                >
                  Didn't receive code? Resend
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setVerificationStep(false);
                    setVerificationCode('');
                    setPendingUser(null);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800 transition"
                >
                  Back to login
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="h-20 w-auto mx-auto mb-4 rounded-xl shadow-lg"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          <div className="hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-2xl shadow-lg mx-auto w-fit">
            CBDA Academy
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mt-4">
            {isLogin ? 'Welcome Back!' : 'Join Us'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isLogin ? 'Sign in to continue your learning' : 'Start your CBDA certification journey'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="John Doe"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <div className="spinner border-white"></div>
              ) : isLogin ? (
                <>
                  <LogIn size={20} />
                  <span>Sign In</span>
                </>
              ) : (
                <>
                  <UserPlus size={20} />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-sm text-gray-600 hover:text-blue-600 transition"
            >
              {isLogin ? (
                <>
                  Don't have an account? <span className="font-semibold">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="font-semibold">Sign in</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;