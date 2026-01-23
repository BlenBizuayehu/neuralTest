import { useEffect } from 'react';
import './SecurityWarningModal.css';

/**
 * SecurityWarningModal - Red modal for dangerous command warnings
 */
export default function SecurityWarningModal({ isOpen, warning, command, onConfirm, onCancel }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return '#f7768e'; // Red
      case 'medium':
        return '#e0af68'; // Yellow/Orange
      case 'low':
        return '#e0af68'; // Yellow/Orange
      default:
        return '#f7768e';
    }
  };

  const getSeverityLabel = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return 'HIGH RISK';
      case 'medium':
        return 'MEDIUM RISK';
      case 'low':
        return 'LOW RISK';
      default:
        return 'RISK';
    }
  };

  const severity = warning?.severity || 'high';
  const reason = warning?.reason || 'This command may be dangerous';
  const commandText = command || warning?.command || '';

  return (
    <>
      {/* Overlay */}
      <div className="security-modal-overlay" onClick={onCancel} />

      {/* Modal */}
      <div className="security-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="security-modal-header">
          <div className="security-header-title">
            <span className="security-header-icon" style={{ color: getSeverityColor(severity) }}>
              ⚠️
            </span>
            <h3>Security Warning</h3>
            <span
              className="security-severity-badge"
              style={{
                backgroundColor: getSeverityColor(severity),
                color: '#1a1b26',
              }}
            >
              {getSeverityLabel(severity)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="security-modal-content">
          <div className="security-warning-message">
            <p className="security-warning-text">{reason}</p>
          </div>

          <div className="security-command-display">
            <div className="security-command-label">Command:</div>
            <code className="security-command-text">{commandText}</code>
          </div>

          <div className="security-warning-details">
            <p>
              This command has been flagged as potentially dangerous. Executing it may:
            </p>
            <ul>
              <li>Delete or modify critical system files</li>
              <li>Cause data loss or system instability</li>
              <li>Expose sensitive information</li>
              <li>Compromise system security</li>
            </ul>
            <p className="security-warning-footer">
              <strong>Are you sure you want to proceed?</strong>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="security-modal-actions">
          <button className="security-btn security-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="security-btn security-btn-confirm"
            onClick={onConfirm}
            style={{ backgroundColor: getSeverityColor(severity) }}
          >
            Confirm & Run
          </button>
        </div>
      </div>
    </>
  );
}
