import { useState } from 'react';
import './AIProposal.css';

/**
 * AIProposal - Shows an AI-suggested command for user review before execution
 */
export default function AIProposal({
  id,
  explanation,
  suggestedCommand,
  confidence,
  warning,
  onRun,
  onDismiss,
  source = 'ai', // 'ai' for ? command, 'fallback' for auto-correction
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const confidenceColor = {
    high: '#4ade80', // green
    medium: '#fbbf24', // yellow
    low: '#f87171', // red
  }[confidence?.toLowerCase()] || '#94a3b8'; // gray default

  const confidenceLabel = confidence ? confidence.charAt(0).toUpperCase() + confidence.slice(1) : 'Unknown';

  return (
    <div className="ai-proposal" id={`proposal-${id}`}>
      <div className="ai-proposal-header">
        <div className="ai-proposal-icon">
          {source === 'fallback' ? '✨' : '🤖'}
        </div>
        <div className="ai-proposal-title">
          {source === 'fallback' 
            ? 'AI Auto-Correction Suggestion' 
            : 'AI Command Proposal'}
        </div>
        <div 
          className="ai-proposal-confidence"
          style={{ color: confidenceColor }}
          title={`Confidence: ${confidenceLabel}`}
        >
          {confidenceLabel}
        </div>
        <button
          className="ai-proposal-dismiss"
          onClick={onDismiss}
          title="Dismiss"
        >
          ×
        </button>
      </div>

      <div className="ai-proposal-content">
        {explanation && (
          <div className="ai-proposal-explanation">
            <strong>Explanation:</strong> {explanation}
          </div>
        )}

        {warning && (
          <div className="ai-proposal-warning">
            ⚠️ <strong>Warning:</strong> {warning}
          </div>
        )}

        <div className="ai-proposal-command">
          <div className="ai-proposal-command-label">Suggested Command:</div>
          <div className="ai-proposal-command-code">
            <code>{suggestedCommand}</code>
            <button
              className="ai-proposal-copy"
              onClick={() => {
                navigator.clipboard.writeText(suggestedCommand);
              }}
              title="Copy command"
            >
              📋
            </button>
          </div>
        </div>
      </div>

      <div className="ai-proposal-actions">
        <button
          className="ai-proposal-run-btn"
          onClick={() => onRun(suggestedCommand)}
        >
          ▶️ Run Command
        </button>
        <button
          className="ai-proposal-dismiss-btn"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
