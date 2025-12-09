import { useState, useEffect, useCallback } from 'react';
import Terminal from './components/Terminal/Terminal';
import AIPanel from './components/AIPanel/AIPanel';
import WorkflowRunner from './components/WorkflowRunner/WorkflowRunner';
import './App.css';
import { getContext, findProjectRoot } from './services/tauriClient';

function App() {
  const [cwd, setCwd] = useState(null);
  const [context, setContext] = useState(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isWorkflowRunnerOpen, setIsWorkflowRunnerOpen] = useState(false);
  const [aiPanelPrompt, setAiPanelPrompt] = useState(null);

  // Initialize working directory
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const initializeCwd = async () => {
    try {
      // Try to find project root first
      const projectRoot = await findProjectRoot(null);
      if (projectRoot) {
        setCwd(projectRoot);
      } else {
        // Default to home directory or current
        setCwd('.');
      }
    } catch (e) {
      console.error('Failed to initialize cwd:', e);
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

  return (
    <div className="app">
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
        </div>
      </header>

      {/* Main Terminal */}
      <main className="app-main">
        <Terminal
          cwd={cwd}
          onCwdChange={handleCwdChange}
          onOpenAiPanel={handleOpenAiPanel}
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
    </div>
  );
}

export default App;
