import { useEffect } from 'react';
import './ConfirmationModal.css';

/**
 * ConfirmationModal - Reusable theme-aware confirmation dialog.
 * Replaces native window.confirm / window.alert for a consistent dark-theme UX.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {string} title - Modal title
 * @param {string} message - Body text
 * @param {function} onConfirm - Called when user clicks Confirm
 * @param {function} onCancel - Called when user clicks Cancel, clicks overlay, or presses Escape
 * @param {string} [confirmVariant='accent'] - 'accent' | 'danger' for Confirm button style
 */
export default function ConfirmationModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmVariant = 'accent',
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = confirmVariant === 'danger';

  return (
    <>
      <div className="confirmation-modal-overlay" onClick={onCancel} aria-hidden="true" />
      <div
        className="confirmation-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-message"
      >
        <div className="confirmation-modal-header">
          <h3 id="confirmation-modal-title">{title}</h3>
        </div>
        <div className="confirmation-modal-body">
          <p id="confirmation-modal-message">{message}</p>
        </div>
        <div className="confirmation-modal-footer">
          <button type="button" className="confirmation-btn confirmation-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`confirmation-btn confirmation-btn-confirm ${isDanger ? 'confirmation-btn-danger' : ''}`}
            onClick={() => {
              onConfirm?.();
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </>
  );
}
