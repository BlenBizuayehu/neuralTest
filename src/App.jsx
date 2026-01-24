import { useState, useEffect, useCallback, useRef } from 'react';
import Terminal from './components/Terminal/Terminal';
import AIPanel from './components/AIPanel/AIPanel';
import HistorySidebar from './components/History/HistorySidebar';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ProfileSidebar from './components/ProfileSidebar/ProfileSidebar';
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
  // User state: { id, email, isVerified } or null for Guest
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [showRegister, setShowRegister] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState('login'); // 'login' | 'forgot'
  const [cwd, setCwd] = useState(null);
  const [context, setContext] = useState(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        setUser(userData);
      } catch {
        setUser(null);
      }
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
      // Escape - Close panels
      if (e.key === 'Escape') {
        setIsAiPanelOpen(false);
        setIsHistoryOpen(false);
        setIsProfileOpen(false);
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

  const handleLogin = useCallback((userData) => {
    // userData: { id, email, isVerified }
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('userId', userData.id.toString());
    localStorage.setItem('userEmail', userData.email);
    setShowRegister(false);
    setShowLoginModal(false);
  }, []);

  const handleLogout = useCallback(() => {
    // Clear auth modal state so a previously requested Forgot Password doesn't appear after logout
    setShowLoginModal(false);
    setShowRegister(false);
    setLoginMode('login');
    // Clear all user data
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('isAuthenticated');
    // Generate new session ID for guest mode
    const newSessionId = generateUUID();
    setSessionId(newSessionId);
    localStorage.setItem('current_session_id', newSessionId);
    setUser(null);
    // Reset terminal if available
    if (terminalInputRef.current) {
      terminalInputRef.current.resetSession?.();
    }
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
    // Close sidebar after selection
    setIsHistoryOpen(false);
  }, []);

  return (
    <div className="app">
      {/* Login/Register Modal - show when auth UI requested; !user only for login/register, forgot works when logged in */}
      {(showLoginModal || showRegister) && (
        <div className="auth-modal-overlay" onClick={() => {
          setShowLoginModal(false);
          setShowRegister(false);
          setLoginMode('login');
        }}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            {showRegister ? (
              <Register
                onRegister={(userId) => {
                  handleLogin(userId);
                  setShowLoginModal(false);
                  setShowRegister(false);
                  setLoginMode('login');
                }}
                onSwitchToLogin={() => {
                  setShowRegister(false);
                  setShowLoginModal(true);
                  setLoginMode('login');
                }}
              />
            ) : (
              <Login
                key={loginMode}
                mode={loginMode}
                onLogin={(userId) => {
                  handleLogin(userId);
                  setShowLoginModal(false);
                  setLoginMode('login');
                }}
                onSwitchToRegister={() => {
                  setShowRegister(true);
                  setShowLoginModal(false);
                  setLoginMode('login');
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
          {context?.project_type && context.project_type !== 'Node.js' && (
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
          {user && (
            <button
              className="header-btn"
              onClick={() => setIsHistoryOpen(true)}
              title="Command History"
            >
              🕐
            </button>
          )}
          <button
            className="header-btn ai-btn"
            onClick={() => setIsAiPanelOpen(true)}
            title="AI Assistant (Ctrl+Shift+P)"
          >
            ✨ AI
          </button>
          {user ? (
            <button
              className="header-btn profile-btn"
              onClick={() => setIsProfileOpen(true)}
              title={user.email}
            >
              👤
            </button>
          ) : (
            <button
              className="header-btn login-btn"
              onClick={() => {
                setShowLoginModal(true);
                setShowRegister(false);
                setLoginMode('login');
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
          userId={user?.id || null}
        />
      </main>

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

      {/* History Sidebar */}
      <HistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectCommand={handleHistoryCommandSelect}
        onSelectSession={handleSessionSelect}
        onNewSession={handleNewSession}
        currentSessionId={sessionId}
        refreshTrigger={historyRefreshTrigger}
      />

      {/* Profile Sidebar */}
      <ProfileSidebar
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        onLogout={() => {
          handleLogout();
          setIsProfileOpen(false);
        }}
        onOpenPasswordReset={() => {
          setIsProfileOpen(false);
          setShowLoginModal(true);
          setShowRegister(false);
          setLoginMode('forgot');
        }}
      />
    </div>
  );
}

export default App;
