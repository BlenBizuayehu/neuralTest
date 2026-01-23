import { useState } from 'react';
import './Auth.css';
import { register } from '../../services/tauriClient';
import EmailVerificationModal from './EmailVerificationModal';

/**
 * Register - User registration component
 */
export default function Register({ onRegister, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [userId, setUserId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(email, password);
      // Result is [userId, verificationCode]
      const [id, code] = Array.isArray(result) ? result : [result, null];
      
      setUserId(id);
      setVerificationCode(code || '');
      setShowVerification(true);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.toString() || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerified = () => {
    // User verified - complete registration
    const userData = {
      id: userId,
      email,
      isVerified: true,
    };
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('userId', userId.toString());
    localStorage.setItem('userEmail', email);
    onRegister?.(userData);
    setShowVerification(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-icon">⚡</span>
          <h2>Create Account</h2>
          <p>Sign up to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <span className="error-icon">❌</span>
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
              minLength={6}
            />
            <small className="form-hint">At least 6 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading || !email || !password || !confirmPassword}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button
              type="button"
              className="auth-link-btn"
              onClick={onSwitchToLogin}
              disabled={isLoading}
            >
              Sign In
            </button>
          </p>
        </div>
      </div>

      {/* Email Verification Modal */}
      {showVerification && (
        <EmailVerificationModal
          email={email}
          verificationCode={verificationCode}
          onVerified={handleVerified}
          onClose={() => {
            // Allow skipping verification (user can verify later)
            const userData = {
              id: userId,
              email,
              isVerified: false,
            };
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.setItem('userId', userId.toString());
            localStorage.setItem('userEmail', email);
            onRegister?.(userData);
            setShowVerification(false);
          }}
        />
      )}
    </div>
  );
}
