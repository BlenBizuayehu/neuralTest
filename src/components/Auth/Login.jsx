import { useState } from 'react';
import './Auth.css';
import { login } from '../../services/tauriClient';
import ForgotPassword from './ForgotPassword';

/**
 * Login - User login component
 */
export default function Login({ onLogin, onSwitchToRegister, mode = 'login' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(mode === 'forgot');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      // Result is [userId, isVerified]
      const [id, isVerified] = Array.isArray(result) ? result : [result, false];

      // Enforce email verification before allowing login
      if (!isVerified) {
        setError('Please verify your email before signing in. Check your inbox for the verification code.');
        return;
      }
      
      const userData = {
        id,
        email,
        isVerified: true,
      };
      
      // Store authentication state in localStorage
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('userId', id.toString());
      localStorage.setItem('userEmail', email);
      localStorage.setItem('isAuthenticated', 'true');
      
      onLogin?.(userData);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.toString() || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <ForgotPassword
        onBack={() => setShowForgotPassword(false)}
        onSuccess={() => {
          setShowForgotPassword(false);
          setError('');
          // Show success message - user can now login with new password
        }}
      />
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-icon">⚡</span>
          <h2>Neural</h2>
          <p>Sign in to continue</p>
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
            />
            <button
              type="button"
              className="forgot-password-link"
              onClick={() => setShowForgotPassword(true)}
              disabled={isLoading}
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading || !email || !password}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <button
              type="button"
              className="auth-link-btn"
              onClick={onSwitchToRegister}
              disabled={isLoading}
            >
              Register
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
