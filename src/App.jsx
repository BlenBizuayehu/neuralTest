import { useState, useEffect, useCallback, useRef } from 'react';
import Terminal from './components/Terminal/Terminal';
import AIPanel from './components/AIPanel/AIPanel';
import WorkflowRunner from './components/WorkflowRunner/WorkflowRunner';
import HistorySidebar from './components/History/HistorySidebar';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import './App.css';
import { getContext, findProjectRoot, getHomeDirectory } from './services/tauriClient';

// Generate UUID v4
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [cwd, setCwd] = useState(null);
  const [context, setContext] = useState(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isWorkflowRunnerOpen, setIsWorkflowRunnerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [aiPanelPrompt, setAiPanelPrompt] = useState(null);
  const [sessionId, setSessionId] = useState(() => {
    // Initialize sessionId: check localStorage first, then generate new
    const stored = localStorage.getItem('current_session_id');
    if (stored && stored.trim() !== '') {
      return stored;
    }
    const newId = generateUUID();
    localStorage.setItem('current_session_id', newId);
    return newId;
  });
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const terminalInputRef = useRef(null);

  // Check authentication status on mount
  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Initialize working directory (works for both authenticated and unauthenticated users)
  useEffect(() => {
    initializeCwd();
  }, []);

  // Update context when cwd changes
  useEffect(() => {
    if (cwd) {
      updateContext(cwd);
    }
  }, [cwd]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Shift+P - Open AI Panel
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsAiPanelOpen(true);
      }
      // Ctrl+Shift+W - Open Workflow Runner
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        setIsWorkflowRunnerOpen(true);
      }
      // Escape - Close panels
      if (e.key === 'Escape') {
        setIsAiPanelOpen(false);
        setIsWorkflowRunnerOpen(false);
        setIsHistoryOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const initializeCwd = async () => {
    try {
      // Get system home directory
      const homeDir = await getHomeDirectory();
      if (homeDir) {
        setCwd(homeDir);
      } else {
        // Fallback: try to find project root
        const projectRoot = await findProjectRoot(null);
        if (projectRoot) {
          setCwd(projectRoot);
        } else {
          // Last resort: current directory
          setCwd('.');
        }
      }
    } catch (e) {
      console.error('Failed to initialize cwd:', e);
      // Fallback to current directory on error
      setCwd('.');
    }
  };

  const updateContext = async (dir) => {
    try {
      const ctx = await getContext(dir);
      setContext(ctx);
    } catch (e) {
      console.error('Failed to get context:', e);
    }
  };

  const handleCwdChange = useCallback((newCwd) => {
    setCwd(newCwd);
  }, []);

  const handleOpenAiPanel = useCallback((prompt) => {
    setAiPanelPrompt(prompt);
    setIsAiPanelOpen(true);
  }, []);

  const handleLogin = useCallback((userId) => {
    setIsAuthenticated(true);
    setShowRegister(false);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    setIsAuthenticated(false);
    setCwd(null);
    setContext(null);
  }, []);

  const handleHistoryCommandSelect = useCallback((command) => {
    // Pass command to Terminal component via ref
    if (terminalInputRef.current) {
      terminalInputRef.current.insertCommand(command);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    // Generate new session ID
    const newSessionId = generateUUID();
    setSessionId(newSessionId);
    // Sync with localStorage so tauriClient.js uses the new session
    localStorage.setItem('current_session_id', newSessionId);
    // Clear terminal blocks by calling reset method if available
    if (terminalInputRef.current) {
      terminalInputRef.current.resetSession?.();
    }
  }, []);

  const handleSessionSelect = useCallback((sessionId) => {
    // Switch to selected session
    setSessionId(sessionId);
    // Sync with localStorage so tauriClient.js uses the selected session
    localStorage.setItem('current_session_id', sessionId);
    // Terminal will load the session content
    if (terminalInputRef.current) {
      terminalInputRef.current.loadSession?.(sessionId);
    }
  }, []);

  return (
    <div className="app">
      {/* Login/Register Modal */}
      {(showLoginModal || showRegister) && !isAuthenticated && (
        <div className="auth-modal-overlay" onClick={() => {
          setShowLoginModal(false);
          setShowRegister(false);
        }}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            {showRegister ? (
              <Register
                onRegister={(userId) => {
                  handleLogin(userId);
                  setShowLoginModal(false);
                  setShowRegister(false);
                }}
                onSwitchToLogin={() => {
                  setShowRegister(false);
                  setShowLoginModal(true);
                }}
              />
            ) : (
              <Login
                onLogin={(userId) => {
                  handleLogin(userId);
                  setShowLoginModal(false);
                }}
                onSwitchToRegister={() => {
                  setShowRegister(true);
                  setShowLoginModal(false);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">Neural</span>
          </div>
          {context?.project_type && (
            <div className="project-badge">
              {context.project_type}
            </div>
          )}
        </div>
        <div className="header-center">
          <div className="cwd-display" title={cwd}>
            📁 {cwd || '~'}
          </div>
        </div>
        <div className="header-right">
          <button
            className="header-btn"
            onClick={handleNewSession}
            title="New Session"
          >
            ➕
          </button>
          <button
            className="header-btn"
            onClick={() => setIsHistoryOpen(true)}
            title="Command History"
          >
            🕐
          </button>
          <button
            className="header-btn"
            onClick={() => setIsWorkflowRunnerOpen(true)}
            title="Workflows (Ctrl+Shift+W)"
          >
            ⚡
          </button>
          <button
            className="header-btn ai-btn"
            onClick={() => setIsAiPanelOpen(true)}
            title="AI Assistant (Ctrl+Shift+P)"
          >
            ✨ AI
          </button>
          {isAuthenticated ? (
            <button
              className="header-btn logout-btn"
              onClick={handleLogout}
              title="Logout"
            >
              🚪
            </button>
          ) : (
            <button
              className="header-btn login-btn"
              onClick={() => {
                setShowLoginModal(true);
                setShowRegister(false);
              }}
              title="Sign In (to save history)"
            >
              🔐 Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Terminal */}
      <main className="app-main">
        <Terminal
          ref={terminalInputRef}
          cwd={cwd}
          sessionId={sessionId}
          onCwdChange={handleCwdChange}
          onOpenAiPanel={handleOpenAiPanel}
          onCommandExecuted={() => setHistoryRefreshTrigger(prev => prev + 1)}
        />
      </main>

      {/* Status Bar */}
      <footer className="app-footer">
        <div className="status-left">
          {context?.has_git && <span className="status-item">🔀 Git</span>}
          {context?.has_package_json && <span className="status-item">📦 npm</span>}
          {context?.has_cargo_toml && <span className="status-item">🦀 Cargo</span>}
          {context?.has_requirements_txt && <span className="status-item">🐍 pip</span>}
        </div>
        <div className="status-right">
          <span className="status-item hint">Ctrl+Shift+P for AI</span>
        </div>
      </footer>

      {/* AI Panel */}
      <AIPanel
        isOpen={isAiPanelOpen}
        onClose={() => {
          setIsAiPanelOpen(false);
          setAiPanelPrompt(null);
        }}
        initialPrompt={aiPanelPrompt}
        cwd={cwd}
      />

      {/* Workflow Runner */}
      <WorkflowRunner
        isOpen={isWorkflowRunnerOpen}
        onClose={() => setIsWorkflowRunnerOpen(false)}
        cwd={cwd}
      />

      {/* History Sidebar */}
      <HistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectCommand={handleHistoryCommandSelect}
        onSelectSession={handleSessionSelect}
        currentSessionId={sessionId}
        refreshTrigger={historyRefreshTrigger}
      />
    </div>
  );
}

export default App;
