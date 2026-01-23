import { useState } from 'react';
import './Auth.css';
import { requestPasswordReset, resetPassword } from '../../services/tauriClient';

/**
 * ForgotPassword - Password recovery component
 */
export default function ForgotPassword({ onBack, onSuccess }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'verify' | 'reset'
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [displayedCode, setDisplayedCode] = useState('');

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const code = await requestPasswordReset(email);
      setDisplayedCode(code);
      setStep('verify');
    } catch (err) {
      console.error('Password reset request error:', err);
      setError(err.toString() || 'Failed to request password reset. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword(email, resetCode, newPassword);
      onSuccess?.();
    } catch (err) {
      console.error('Password reset error:', err);
      setError(err.toString() || 'Failed to reset password. Please check your code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-icon">🔑</span>
          <h2>Reset Password</h2>
          <p>
            {step === 'request' && 'Enter your email to receive a reset code'}
            {step === 'verify' && 'Enter the reset code and new password'}
          </p>
        </div>

        {step === 'request' && (
          <form onSubmit={handleRequestReset} className="auth-form">
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

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading || !email}
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Sending code...
                </>
              ) : (
                'Send Reset Code'
              )}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <>
            <div className="verification-info">
              <p className="verification-code-display">
                <strong>Simulated Email Sent:</strong> Your reset code is{' '}
                <code className="verification-code">{displayedCode}</code>
              </p>
              <p className="verification-hint">
                (In a real app, this would be sent via email)
              </p>
            </div>

            <form onSubmit={handleVerifyAndReset} className="auth-form">
              {error && (
                <div className="auth-error">
                  <span className="error-icon">❌</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="resetCode">Reset Code</label>
                <input
                  id="resetCode"
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  autoFocus
                  disabled={isLoading}
                  maxLength={6}
                  pattern="[0-9]{6}"
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  minLength={6}
                />
                <small className="form-hint">At least 6 characters</small>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
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
                disabled={isLoading || !resetCode || !newPassword || !confirmPassword}
              >
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    Resetting password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          </>
        )}

        <div className="auth-footer">
          <button
            type="button"
            className="auth-link-btn"
            onClick={onBack}
            disabled={isLoading}
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
