import { useState } from 'react';
import { verifyEmail } from '../../services/tauriClient';
import './Auth.css';

/**
 * EmailVerificationModal - Modal for email verification after registration
 */
export default function EmailVerificationModal({ email, verificationCode, onVerified, onClose }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const isValid = await verifyEmail(email, code);
      if (isValid) {
        onVerified?.();
      } else {
        setError('Invalid verification code. Please try again.');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError(err.toString() || 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-card">
          <div className="auth-header">
            <span className="auth-icon">✉️</span>
            <h2>Verify Your Email</h2>
            <p>Enter the verification code sent to your email</p>
          </div>

          <div className="verification-info">
            <p className="verification-code-display">
              <strong>Simulated Email Sent:</strong> Your verification code is{' '}
              <code className="verification-code">{verificationCode}</code>
            </p>
            <p className="verification-hint">
              (In a real app, this would be sent via email)
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && (
              <div className="auth-error">
                <span className="error-icon">❌</span>
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
                disabled={isLoading}
                maxLength={6}
                pattern="[0-9]{6}"
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <button
              type="button"
              className="auth-link-btn"
              onClick={onClose}
              disabled={isLoading}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
