import { useState, useEffect } from 'react';
import './ProfileSidebar.css';

/**
 * ProfileSidebar - sliding sidebar for account & appearance settings
 */
export default function ProfileSidebar({ isOpen, onClose, user, onLogout, onOpenPasswordReset }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  // Apply theme to document root
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  if (!isOpen) return null;

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogoutClick = () => {
    onLogout?.();
    onClose?.();
  };

  const handlePasswordResetClick = () => {
    onClose?.();
    onOpenPasswordReset?.();
  };

  const email = user?.email || 'Guest';

  return (
    <>
      {/* Overlay */}
      <div className="profile-sidebar-overlay" onClick={onClose} />

      {/* Sidebar */}
      <div className="profile-sidebar">
        {/* Header */}
        <div className="profile-sidebar-header">
          <div className="profile-header-title">
            <span className="profile-header-icon">👤</span>
            <div className="profile-header-text">
              <h3>Profile</h3>
              <p>{email}</p>
            </div>
          </div>
          <button className="profile-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="profile-content">
          {/* Theme */}
          <div className="profile-section">
            <h4>Appearance</h4>
            <div className="profile-row">
              <div className="profile-row-text">
                <span className="profile-row-title">Theme</span>
                <span className="profile-row-subtitle">
                  {theme === 'dark' ? 'Dark (recommended)' : 'Light'}
                </span>
              </div>
              <button className="profile-toggle" onClick={toggleTheme}>
                <span className={theme === 'dark' ? 'active' : ''}>Dark</span>
                <span className={theme === 'light' ? 'active' : ''}>Light</span>
              </button>
            </div>
          </div>

          {/* Security */}
          <div className="profile-section">
            <h4>Security</h4>
            <button
              className="profile-action-btn"
              type="button"
              onClick={handlePasswordResetClick}
            >
              🔑 Reset password
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="profile-sidebar-footer">
          <button
            className="profile-logout-btn"
            type="button"
            onClick={handleLogoutClick}
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
