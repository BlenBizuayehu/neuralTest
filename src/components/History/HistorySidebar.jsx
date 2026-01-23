import { useState, useEffect, useRef } from 'react';
import { getSessions } from '../../services/tauriClient';
import './HistorySidebar.css';

/**
 * HistorySidebar - Sliding sidebar for session history
 */
export default function HistorySidebar({ isOpen, onClose, onSelectCommand, onSelectSession, currentSessionId, refreshTrigger, onNewSession }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchInputRef = useRef(null);

  // Fetch sessions on mount and when sidebar opens
  useEffect(() => {
    if (isOpen) {
      loadSessions();
      // Focus search input when sidebar opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Refresh when refreshTrigger changes (command executed)
  useEffect(() => {
    if (isOpen && refreshTrigger !== undefined) {
      loadSessions();
    }
  }, [refreshTrigger, isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getSessions();
      
      // Debug logging to see exactly what we receive
      console.log('[HistorySidebar] Raw response from getSessions:', response);
      console.log('[HistorySidebar] Response type:', typeof response);
      console.log('[HistorySidebar] Is array?', Array.isArray(response));
      
      // Handle null/undefined/empty responses
      let sessionList = [];
      if (response) {
        if (Array.isArray(response)) {
          sessionList = response;
        } else if (typeof response === 'object') {
          // If it's an object, try to extract an array from it
          sessionList = response.sessions || response.data || [];
        }
      }
      
      // Normalize data structure to handle both snake_case and camelCase
      const normalizedSessions = sessionList.map((session) => {
        // Handle both snake_case (from Rust) and camelCase (if transformed)
        const sessionId = session.session_id || session.sessionId || session.id || null;
        const startTime = session.start_time || session.startTime || session.timestamp || null;
        const title = session.title || session.command_text || session.commandText || 'Untitled Session';
        
        return {
          session_id: sessionId,
          start_time: startTime,
          title: title,
          // Keep original for debugging
          _raw: session,
        };
      }).filter((session) => {
        // Filter out invalid sessions (must have session_id)
        if (!session.session_id) {
          console.warn('[HistorySidebar] Filtered out invalid session:', session);
          return false;
        }
        return true;
      });
      
      console.log('[HistorySidebar] Normalized sessions:', normalizedSessions);
      console.log('[HistorySidebar] Session count:', normalizedSessions.length);
      
      setSessions(normalizedSessions);
    } catch (e) {
      console.error('[HistorySidebar] Failed to load sessions:', e);
      console.error('[HistorySidebar] Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name,
      });
      setError('Failed to load sessions. Please try again.');
      setSessions([]); // Ensure we have an empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  // Filter sessions based on search term
  const filteredSessions = sessions.filter((session) => {
    if (!searchTerm.trim()) return true;
    if (!session) return false;
    
    const search = searchTerm.toLowerCase();
    const title = (session.title || '').toLowerCase();
    const sessionId = (session.session_id || '').toLowerCase();
    
    return title.includes(search) || sessionId.includes(search);
  });

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) {
        return 'Just now';
      } else if (diffMins < 60) {
        return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      } else if (diffDays < 7) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      } else {
        // Use Intl.DateTimeFormat for older dates
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
          -diffDays,
          'day'
        );
      }
    } catch (e) {
      return 'Unknown';
    }
  };

  const handleSessionClick = (sessionId) => {
    if (onSelectSession) {
      onSelectSession(sessionId);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="history-sidebar-overlay" onClick={onClose} />

      {/* Sidebar */}
      <div className="history-sidebar">
        {/* Header */}
        <div className="history-sidebar-header">
          <div className="history-header-title">
            <span className="history-header-icon">🕐</span>
            <h3>Sessions</h3>
          </div>
          <div className="history-header-actions">
            {onNewSession && (
              <button 
                className="history-new-session-btn" 
                onClick={onNewSession} 
                title="New Chat (Start a new session)"
              >
                ➕
              </button>
            )}
            <button className="history-close-btn" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="history-search-container">
          <input
            ref={searchInputRef}
            type="text"
            className="history-search-input"
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="history-clear-search"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="history-content">
          {isLoading ? (
            <div className="history-loading">
              <div className="history-spinner"></div>
              <p>Loading sessions...</p>
            </div>
          ) : error ? (
            <div className="history-error">
              <p>{error}</p>
              <button className="history-retry-btn" onClick={loadSessions}>
                Retry
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="history-empty">
              <span className="history-empty-icon">📝</span>
              <p style={{ color: 'var(--text-muted, #565f89)', fontSize: '14px', lineHeight: '1.6' }}>
                {searchTerm
                  ? 'No sessions found matching your search.'
                  : 'No history found. Run a command to start a session.'}
              </p>
              {sessions.length === 0 && !isLoading && (
                <p style={{ 
                  color: 'var(--text-muted, #565f89)', 
                  fontSize: '12px', 
                  marginTop: '8px',
                  opacity: 0.7 
                }}>
                  Debug: {sessions.length} sessions loaded
                </p>
              )}
            </div>
          ) : (
            <div className="history-list">
              {filteredSessions.map((session, index) => {
                // Safely extract values with fallbacks
                const sessionId = session?.session_id || session?.sessionId || session?.id || `session-${index}`;
                const title = session?.title || session?.command_text || session?.commandText || 'Untitled Session';
                const startTime = session?.start_time || session?.startTime || session?.timestamp || null;
                const isCurrent = sessionId === currentSessionId;
                
                return (
                  <div
                    key={sessionId}
                    className={`history-item ${isCurrent ? 'history-item-active' : ''}`}
                    onClick={() => {
                      console.log('[HistorySidebar] Clicked session:', { sessionId, title, session });
                      handleSessionClick(sessionId);
                    }}
                    title={`Click to restore session: ${title}`}
                  >
                    <div className="history-item-command">
                      <code style={{ 
                        fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
                        fontSize: '13px',
                        fontWeight: '500'
                      }}>
                        {title}
                      </code>
                      {isCurrent && (
                        <span className="history-current-badge" title="Current session">
                          ●
                        </span>
                      )}
                    </div>
                    <div className="history-item-meta">
                      <span className="history-item-time" style={{ 
                        fontSize: '12px',
                        color: 'var(--text-muted, #565f89)'
                      }}>
                        {startTime ? formatRelativeTime(startTime) : 'Unknown time'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="history-sidebar-footer">
          <span className="history-footer-text">
            {filteredSessions.length > 0
              ? `${filteredSessions.length} of ${sessions.length} sessions`
              : 'No sessions'}
          </span>
        </div>
      </div>
    </>
  );
}
