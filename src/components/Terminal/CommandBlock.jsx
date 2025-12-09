import { useState } from 'react';
import './CommandBlock.css';

/**
 * CommandBlock - Displays a single command with its output
 */
export default function CommandBlock({
  id,
  command,
  stdout,
  stderr,
  exitCode,
  timestamp,
  isRunning,
  generatedByAi,
  onRerun,
  onCopy,
  onKill,
  onExplain,
  suggestion,
  onApplyFix,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const hasOutput = stdout || stderr;
  const hasError = exitCode !== null && exitCode !== 0;

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    onCopy?.();
  };

  const handleCopyOutput = () => {
    const output = stdout || stderr || '';
    navigator.clipboard.writeText(output);
  };

  return (
    <div className={`command-block ${hasError ? 'error' : ''} ${isRunning ? 'running' : ''}`}>
      {/* Command Header */}
      <div className="command-header">
        <div className="command-info">
          <span className="prompt">❯</span>
          <span className="command-text">{command}</span>
          {generatedByAi && <span className="ai-badge">AI</span>}
        </div>
        <div className="command-actions">
          <span className="timestamp">{formatTimestamp(timestamp)}</span>
          {isRunning ? (
            <button className="action-btn kill" onClick={() => onKill?.(id)} title="Kill">
              ■
            </button>
          ) : (
            <>
              <button className="action-btn" onClick={handleCopy} title="Copy command">
                📋
              </button>
              <button className="action-btn" onClick={() => onRerun?.(command)} title="Re-run">
                ↻
              </button>
              <button className="action-btn" onClick={() => onExplain?.(command)} title="Explain">
                ?
              </button>
              {hasOutput && (
                <button
                  className="action-btn"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? '▼' : '▲'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Output Area */}
      {!isCollapsed && hasOutput && (
        <div className="command-output">
          {stdout && <pre className="stdout">{stdout}</pre>}
          {stderr && <pre className="stderr">{stderr}</pre>}
          <button className="copy-output-btn" onClick={handleCopyOutput} title="Copy output">
            📋
          </button>
        </div>
      )}

      {/* Exit Code */}
      {exitCode !== null && !isRunning && (
        <div className={`exit-code ${hasError ? 'error' : 'success'}`}>
          Exit: {exitCode}
        </div>
      )}

      {/* Running Indicator */}
      {isRunning && (
        <div className="running-indicator">
          <span className="spinner"></span>
          Running...
        </div>
      )}

      {/* Error Suggestion */}
      {suggestion && hasError && (
        <div className="error-suggestion">
          <div className="suggestion-header">
            <span className="suggestion-icon">💡</span>
            <span>AI Suggestion</span>
          </div>
          <p className="explanation">{suggestion.explanation}</p>
          {suggestion.fixes && suggestion.fixes.length > 0 && (
            <div className="suggested-fixes">
              <span className="fixes-label">Suggested fixes:</span>
              {suggestion.fixes.map((fix, index) => (
                <div key={index} className="fix-item">
                  <code>{fix}</code>
                  <button
                    className="apply-fix-btn"
                    onClick={() => onApplyFix?.(fix)}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


