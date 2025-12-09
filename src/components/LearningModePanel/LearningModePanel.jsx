import { useState, useEffect } from 'react';
import './LearningModePanel.css';
import { explainCommand } from '../../services/tauriClient';

/**
 * LearningModePanel - Shows detailed command explanations
 */
export default function LearningModePanel({ command, onClose }) {
  const [explanation, setExplanation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (command) {
      fetchExplanation();
    }
  }, [command]);

  const fetchExplanation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await explainCommand(command);
      setExplanation(result);
    } catch (e) {
      setError(e.toString());
    } finally {
      setIsLoading(false);
    }
  };

  if (!command) return null;

  return (
    <div className="learning-panel">
      <div className="learning-header">
        <div className="learning-title">
          <span className="learning-icon">📚</span>
          <h3>Learning Mode</h3>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="learning-content">
        <div className="command-display">
          <code>{command}</code>
        </div>

        {isLoading && (
          <div className="loading-state">
            <span className="spinner"></span>
            <span>Analyzing command...</span>
          </div>
        )}

        {error && (
          <div className="error-state">
            <span className="error-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {explanation && (
          <>
            <div className="summary-section">
              <h4>Summary</h4>
              <p>{explanation.summary}</p>
            </div>

            <div className="breakdown-section">
              <h4>Breakdown</h4>
              <div className="parts-list">
                {explanation.parts.map((part, index) => (
                  <div key={index} className="part-row">
                    <div className="part-token">
                      <code>{part.token}</code>
                    </div>
                    <div className="part-explanation">
                      {part.explain}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="tips-section">
              <h4>💡 Tips</h4>
              <ul>
                <li>Use <code>--help</code> flag for more options</li>
                <li>Check <code>man {command.split(' ')[0]}</code> for full documentation</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


