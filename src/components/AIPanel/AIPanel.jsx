import { useState, useEffect, useRef } from 'react';
import './AIPanel.css';
import {
  nlToCmd,
  explainCommand,
  runCommand,
  isAiConfigured,
  setApiKey,
  setGeminiApiKey,
  setOpenaiApiKey,
  setAiProvider,
  generateWorkflow,
  clearApiKey,
} from '../../services/tauriClient';

/**
 * AIPanel - Sliding AI assistant panel
 */
export default function AIPanel({ isOpen, onClose, initialPrompt, cwd }) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [provider, setProvider] = useState('gemini'); // 'gemini' or 'openai'
  const [mode, setMode] = useState('chat'); // 'chat', 'explain', 'workflow'
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    checkConfiguration();
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkConfiguration();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialPrompt) {
      if (initialPrompt.type === 'explain') {
        setMode('explain');
        handleExplainCommand(initialPrompt.command);
      } else {
        setMode('chat');
      }
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const checkConfiguration = async () => {
    try {
      const configured = await isAiConfigured();
      setIsConfigured(configured);
      // If not configured, ensure API key input is visible
      if (!configured) {
        setIsConfigured(false);
      }
    } catch (e) {
      console.error('Failed to check AI configuration:', e);
      setIsConfigured(false);
    }
  };

  const handleSetApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      // Set provider first
      await setAiProvider(provider);
      
      // Then set the appropriate API key
      if (provider === 'gemini') {
        await setGeminiApiKey(apiKeyInput.trim());
      } else {
        await setOpenaiApiKey(apiKeyInput.trim());
      }
      
      setIsConfigured(true);
      setApiKeyInput('');
      addMessage('system', `${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key configured successfully! You can now use AI features.`);
    } catch (e) {
      addMessage('error', `Failed to set API key: ${e}`);
    }
  };

  const handleResetApiKey = async () => {
    if (confirm('Are you sure you want to reset your API key? You will need to enter it again.')) {
      try {
        await clearApiKey();
        setIsConfigured(false);
        setApiKeyInput('');
        addMessage('system', 'API key cleared. Please enter a new API key.');
      } catch (e) {
        addMessage('error', `Failed to clear API key: ${e}`);
      }
    }
  };

  const addMessage = (type, content, data = null) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), type, content, data, timestamp: new Date() },
    ]);
  };

  const handleExplainCommand = async (command) => {
    addMessage('user', `Explain: ${command}`);
    setIsLoading(true);
    try {
      const explanation = await explainCommand(command, cwd);
      addMessage('assistant', explanation.summary, { parts: explanation.parts });
    } catch (e) {
      addMessage('error', `Failed to explain command: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isLoading) return;

    addMessage('user', text);
    setInputValue('');
    setIsLoading(true);

    try {
      if (mode === 'workflow') {
        // Generate workflow
        const steps = await generateWorkflow(text, cwd);
        addMessage('assistant', 'Generated workflow:', { workflow: steps });
      } else {
        // Natural language to command
        const response = await nlToCmd(text, cwd);
        
        if (response.warning) {
          addMessage('warning', response.warning);
        }
        
        if (response.commands && response.commands.length > 0) {
          addMessage('assistant', response.explanation || 'Here are the commands:', {
            commands: response.commands,
          });
        } else {
          addMessage('assistant', response.explanation || 'No commands generated.');
        }
      }
    } catch (e) {
      addMessage('error', `Error: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunCommand = async (command) => {
    try {
      await runCommand(command, cwd, true, false);
      addMessage('system', `Running: ${command}`);
    } catch (e) {
      addMessage('error', `Failed to run command: ${e}`);
    }
  };

  const handleCopyCommand = (command) => {
    navigator.clipboard.writeText(command);
    addMessage('system', 'Command copied to clipboard');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose?.();
    }
  };

  const renderMessage = (message) => {
    switch (message.type) {
      case 'user':
        return (
          <div key={message.id} className="message user-message">
            <div className="message-content">{message.content}</div>
          </div>
        );

      case 'assistant':
        return (
          <div key={message.id} className="message assistant-message">
            <div className="message-header">
              <span className="ai-icon">✨</span>
              <span>Neural AI</span>
            </div>
            <div className="message-content">{message.content}</div>
            
            {/* Render commands */}
            {message.data?.commands && (
              <div className="commands-list">
                {message.data.commands.map((cmd, idx) => (
                  <div key={idx} className="command-item">
                    <code>{cmd}</code>
                    <div className="command-actions">
                      <button onClick={() => handleCopyCommand(cmd)} title="Copy">
                        📋
                      </button>
                      <button onClick={() => handleRunCommand(cmd)} title="Run">
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Render explanation parts */}
            {message.data?.parts && (
              <div className="explanation-parts">
                {message.data.parts.map((part, idx) => (
                  <div key={idx} className="part-item">
                    <code className="part-token">{part.token}</code>
                    <span className="part-explain">{part.explain}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Render workflow */}
            {message.data?.workflow && (
              <div className="workflow-preview">
                {message.data.workflow.map((step, idx) => (
                  <div key={idx} className="workflow-step">
                    <span className="step-number">{step.step}</span>
                    <code className="step-cmd">{step.cmd}</code>
                  </div>
                ))}
                <button className="run-workflow-btn">
                  Run Workflow
                </button>
              </div>
            )}
          </div>
        );

      case 'warning':
        return (
          <div key={message.id} className="message warning-message">
            <span className="warning-icon">⚠️</span>
            <div className="message-content">{message.content}</div>
          </div>
        );

      case 'error':
        return (
          <div key={message.id} className="message error-message">
            <span className="error-icon">❌</span>
            <div className="message-content">{message.content}</div>
          </div>
        );

      case 'system':
        return (
          <div key={message.id} className="message system-message">
            <div className="message-content">{message.content}</div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-panel-overlay" onClick={onClose}>
      <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-panel-header">
          <div className="header-title">
            <span className="header-icon">✨</span>
            <h3>Neural AI</h3>
          </div>
          <div className="header-actions">
            <div className="mode-tabs">
              <button
                className={`mode-tab ${mode === 'chat' ? 'active' : ''}`}
                onClick={() => setMode('chat')}
              >
                Chat
              </button>
              <button
                className={`mode-tab ${mode === 'workflow' ? 'active' : ''}`}
                onClick={() => setMode('workflow')}
              >
                Workflow
              </button>
            </div>
            {isConfigured && (
              <button 
                className="reset-btn" 
                onClick={handleResetApiKey}
                title="Reset API Key"
              >
                🔑
              </button>
            )}
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* API Key Configuration - Always show if not configured */}
        {!isConfigured ? (
          <div className="api-key-setup">
            <div className="setup-header">
              <h4>🔑 API Key Required</h4>
              <p>Configure your AI API key to use AI features</p>
            </div>
            <div className="provider-selector">
              <label>
                <input
                  type="radio"
                  value="gemini"
                  checked={provider === 'gemini'}
                  onChange={(e) => setProvider(e.target.value)}
                />
                <span>Gemini (Free, Recommended)</span>
              </label>
              <label>
                <input
                  type="radio"
                  value="openai"
                  checked={provider === 'openai'}
                  onChange={(e) => setProvider(e.target.value)}
                />
                <span>OpenAI (Paid)</span>
              </label>
            </div>
            <div className="api-key-input">
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={provider === 'gemini' ? 'AIza... (Paste your Gemini API key here)' : 'sk-... (Paste your OpenAI API key here)'}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && apiKeyInput.trim()) {
                    handleSetApiKey();
                  }
                }}
              />
              <button 
                onClick={handleSetApiKey} 
                disabled={!apiKeyInput.trim()}
                style={{ opacity: apiKeyInput.trim() ? 1 : 0.5 }}
              >
                Save
              </button>
            </div>
            {provider === 'gemini' && (
              <div className="setup-help">
                <p className="hint">
                  💡 <strong>Get your FREE API key:</strong>
                </p>
                <ol className="setup-steps">
                  <li>Visit: <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">https://makersuite.google.com/app/apikey</a></li>
                  <li>Click "Create API Key"</li>
                  <li>Copy the key (starts with AIza...)</li>
                  <li>Paste it above and click Save</li>
                </ol>
              </div>
            )}
          </div>
        ) : null}

        {/* Messages - Only show when configured */}
        {isConfigured && (
          <>
            <div className="ai-panel-messages" ref={messagesRef}>
              {messages.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">💬</span>
                  <p>
                    {mode === 'chat'
                      ? 'Describe what you want to do in natural language'
                      : 'Describe a workflow to automate'}
                  </p>
                  <div className="suggestions">
                    <button onClick={() => setInputValue('install dependencies and start dev server')}>
                      Install deps & start server
                    </button>
                    <button onClick={() => setInputValue('show all running docker containers')}>
                      List Docker containers
                    </button>
                    <button onClick={() => setInputValue('create a new git branch called feature')}>
                      Create git branch
                    </button>
                  </div>
                </div>
              )}
              {messages.map(renderMessage)}
              {isLoading && (
                <div className="loading-indicator">
                  <span className="loading-spinner"></span>
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            {/* Input - Only show when configured */}
            <form className="ai-panel-input" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'chat'
                    ? 'What would you like to do?'
                    : 'Describe your workflow...'
                }
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !inputValue.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}


