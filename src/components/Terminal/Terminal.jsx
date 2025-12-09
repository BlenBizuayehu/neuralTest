import { useState, useEffect, useRef, useCallback } from 'react';
import CommandBlock from './CommandBlock';
import './Terminal.css';
import {
  runCommand,
  killCommand,
  analyzeError,
  explainCommand,
  onCommandStdout,
  onCommandStderr,
  onCommandExit,
  onCommandStarted,
  getHistory,
  nlToCmd,
} from '../../services/tauriClient';

/**
 * Terminal - Main terminal component with command blocks
 */
export default function Terminal({ cwd, onCwdChange, onOpenAiPanel }) {
  const [commandBlocks, setCommandBlocks] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const inputRef = useRef(null);
  const terminalRef = useRef(null);
  const unlistenRefs = useRef([]);
  const pendingAiFallback = useRef(null); // Store original command for AI fallback

  // Handle AI fallback when command fails
  const handleAiFallback = useCallback(async (originalCmd, errorMsg) => {
    setIsAiThinking(true);
    
    // Show "Thinking..." message (original error block already exists)
    const thinkingId = Date.now();
    setCommandBlocks((prev) => [
      ...prev,
      {
        id: thinkingId,
        command: '✨ AI Auto-correction',
        timestamp: new Date().toISOString(),
        isRunning: true,
        stdout: 'Thinking...',
        stderr: '',
        exitCode: null,
        generatedByAi: true,
      },
    ]);

    try {
      const response = await nlToCmd(originalCmd, cwd);
      
      if (response.commands && response.commands.length > 0) {
        const aiCommand = response.commands[0];
        
        // Update thinking message to show the generated command
        setCommandBlocks((prev) =>
          prev.map((block) =>
            block.id === thinkingId
              ? {
                  ...block,
                  stdout: `✨ AI Auto-correction: ${aiCommand}`,
                  isRunning: false,
                }
              : block
          )
        );

        // Execute the AI-generated command
        const result = await runCommand(aiCommand, cwd, true, false);
        
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: result.id,
            command: aiCommand,
            timestamp: result.timestamp,
            isRunning: true,
            stdout: '',
            stderr: '',
            exitCode: null,
            generatedByAi: true,
          },
        ]);

        setCommandHistory((prev) => [aiCommand, ...prev.filter((c) => c !== aiCommand)].slice(0, 100));
      } else {
        // No command generated, remove thinking message
        setCommandBlocks((prev) =>
          prev.filter((block) => block.id !== thinkingId)
        );
      }
    } catch (error) {
      // Remove thinking message on error
      setCommandBlocks((prev) =>
        prev.filter((block) => block.id !== thinkingId)
      );
      console.error('AI fallback failed:', error);
    } finally {
      setIsAiThinking(false);
      setIsLoading(false);
    }
  }, [cwd]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Set up event listeners
  useEffect(() => {
    const setupListeners = async () => {
      // Command stdout
      const unlistenStdout = await onCommandStdout(({ id, chunk }) => {
        setCommandBlocks((prev) =>
          prev.map((block) =>
            block.id === id
              ? { ...block, stdout: (block.stdout || '') + chunk }
              : block
          )
        );
      });

      // Command stderr
      const unlistenStderr = await onCommandStderr(({ id, chunk }) => {
        setCommandBlocks((prev) =>
          prev.map((block) =>
            block.id === id
              ? { ...block, stderr: (block.stderr || '') + chunk }
              : block
          )
        );
      });

      // Command exit
      const unlistenExit = await onCommandExit(async ({ id, exit_code }) => {
        setCommandBlocks((prev) => {
          const updated = prev.map((block) =>
            block.id === id
              ? { ...block, exitCode: exit_code, isRunning: false }
              : block
          );

          // Step C: Check for "not recognized" error and trigger AI fallback
          if (exit_code !== 0) {
            const block = updated.find((b) => b.id === id);
            if (block) {
              const errorText = (block.stderr || '').toLowerCase();
              const isNotRecognized = 
                errorText.includes('not recognized') ||
                errorText.includes('command not found') ||
                errorText.includes('not found') ||
                errorText.includes('is not recognized as an internal or external command');

              // Check if this was a pending AI fallback candidate
              if (isNotRecognized && pendingAiFallback.current && pendingAiFallback.current.commandId === id) {
                const originalCmd = pendingAiFallback.current.originalCmd;
                pendingAiFallback.current = null;
                
                // Trigger AI fallback asynchronously
                setTimeout(() => {
                  handleAiFallback(originalCmd, block.stderr || 'Command not found');
                }, 100);
              } else if (block.stderr && !isNotRecognized) {
                // For other errors, get AI error analysis
                analyzeError(
                  block.stderr,
                  exit_code,
                  block.command,
                  cwd
                ).then((suggestion) => {
                  setCommandBlocks((prev) =>
                    prev.map((b) =>
                      b.id === id ? { ...b, suggestion } : b
                    )
                  );
                }).catch((e) => {
                  console.error('Failed to get error suggestion:', e);
                });
              }
            }
          }

          return updated;
        });
      });

      // Command started
      const unlistenStarted = await onCommandStarted(({ id, command_text, timestamp }) => {
        // Update block if it exists (might already be added by handleSubmit)
        setCommandBlocks((prev) => {
          const exists = prev.some((b) => b.id === id);
          if (exists) return prev;
          return [
            ...prev,
            {
              id,
              command: command_text,
              timestamp,
              isRunning: true,
              stdout: '',
              stderr: '',
              exitCode: null,
            },
          ];
        });
      });

      unlistenRefs.current = [
        unlistenStdout,
        unlistenStderr,
        unlistenExit,
        unlistenStarted,
      ];
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach((unlisten) => unlisten?.());
    };
  }, [cwd, handleAiFallback]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [commandBlocks]);

  const loadHistory = async () => {
    try {
      const history = await getHistory(50, 0);
      setCommandHistory(history.map((h) => h.command_text));
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cmd = inputValue.trim();
    if (!cmd) return;

    // Check for cd command
    if (cmd.startsWith('cd ')) {
      const newDir = cmd.slice(3).trim();
      onCwdChange?.(newDir);
      setInputValue('');
      return;
    }

    // Check for clear command
    if (cmd === 'clear' || cmd === 'cls') {
      setCommandBlocks([]);
      setInputValue('');
      return;
    }

    // Step A: Check for AI trigger character (? or /)
    if (cmd.startsWith('?') || cmd.startsWith('/')) {
      const aiPrompt = cmd.slice(1).trim();
      if (aiPrompt) {
        await handleAiCommand(aiPrompt);
      }
      setInputValue('');
      return;
    }

    setIsLoading(true);
    setInputValue('');
    setHistoryIndex(-1);

    // Step B: Try to execute the command normally
    try {
      const result = await runCommand(cmd, cwd, false, false);
      
      // Store original command for potential AI fallback
      pendingAiFallback.current = { originalCmd: cmd, commandId: result.id };
      
      // Add command block
      setCommandBlocks((prev) => [
        ...prev,
        {
          id: result.id,
          command: cmd,
          timestamp: result.timestamp,
          isRunning: true,
          stdout: '',
          stderr: '',
          exitCode: null,
        },
      ]);

      // Update history
      setCommandHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 100));
    } catch (error) {
      // If command fails to start, try AI fallback immediately
      const errorStr = error.toString().toLowerCase();
      if (errorStr.includes('not recognized') || errorStr.includes('command not found') || errorStr.includes('not found')) {
        await handleAiFallback(cmd, error.toString());
      } else {
        // Add error block for other types of errors
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: Date.now(),
            command: cmd,
            timestamp: new Date().toISOString(),
            isRunning: false,
            stdout: '',
            stderr: error.toString(),
            exitCode: 1,
          },
        ]);
      }
      setIsLoading(false);
    }
  };

  // Handle AI command (triggered by ? or /)
  const handleAiCommand = async (prompt) => {
    setIsAiThinking(true);
    try {
      const response = await nlToCmd(prompt, cwd);
      
      if (response.commands && response.commands.length > 0) {
        // Execute the first AI-generated command
        const aiCommand = response.commands[0];
        
        // Show AI correction message
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: Date.now(),
            command: `✨ AI: ${prompt}`,
            timestamp: new Date().toISOString(),
            isRunning: false,
            stdout: `Generated command: ${aiCommand}`,
            stderr: '',
            exitCode: null,
            generatedByAi: true,
          },
        ]);

        // Execute the AI command
        setIsLoading(true);
        const result = await runCommand(aiCommand, cwd, true, false);
        
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: result.id,
            command: aiCommand,
            timestamp: result.timestamp,
            isRunning: true,
            stdout: '',
            stderr: '',
            exitCode: null,
            generatedByAi: true,
          },
        ]);

        setCommandHistory((prev) => [aiCommand, ...prev.filter((c) => c !== aiCommand)].slice(0, 100));
        setIsLoading(false);
      } else {
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: Date.now(),
            command: `✨ AI: ${prompt}`,
            timestamp: new Date().toISOString(),
            isRunning: false,
            stdout: response.explanation || 'No command generated.',
            stderr: '',
            exitCode: null,
          },
        ]);
      }
    } catch (error) {
      setCommandBlocks((prev) => [
        ...prev,
        {
          id: Date.now(),
          command: `✨ AI: ${prompt}`,
          timestamp: new Date().toISOString(),
          isRunning: false,
          stdout: '',
          stderr: `AI Error: ${error}`,
          exitCode: 1,
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };


  const handleKeyDown = (e) => {
    // History navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // TODO: Implement autocomplete
    } else if (e.key === 'Escape') {
      setInputValue('');
      setHistoryIndex(-1);
    }
  };

  const handleRerun = (command) => {
    setInputValue(command);
    inputRef.current?.focus();
  };

  const handleKill = async (id) => {
    try {
      await killCommand(id);
    } catch (e) {
      console.error('Failed to kill command:', e);
    }
  };

  const handleExplain = async (command) => {
    onOpenAiPanel?.({ type: 'explain', command });
  };

  const handleApplyFix = (fix) => {
    setInputValue(fix);
    inputRef.current?.focus();
  };

  const handleCopy = () => {
    // Visual feedback could be added here
  };

  return (
    <div className="terminal" ref={terminalRef}>
      <div className="terminal-content">
        {/* Welcome Message */}
        {commandBlocks.length === 0 && (
          <div className="welcome-message">
            <h2>Welcome to Project Neural</h2>
            <p>Your AI-powered terminal assistant</p>
            <div className="tips">
              <div className="tip">
                <span className="tip-key">↑/↓</span>
                <span>Navigate history</span>
              </div>
              <div className="tip">
                <span className="tip-key">Ctrl+Shift+P</span>
                <span>AI Assistant</span>
              </div>
              <div className="tip">
                <span className="tip-key">? or /</span>
                <span>AI command prefix</span>
              </div>
              <div className="tip">
                <span className="tip-key">✨</span>
                <span>Auto-correction on errors</span>
              </div>
              <div className="tip">
                <span className="tip-key">clear</span>
                <span>Clear terminal</span>
              </div>
            </div>
          </div>
        )}

        {/* Command Blocks */}
        {commandBlocks.map((block) => (
          <CommandBlock
            key={block.id}
            id={block.id}
            command={block.command}
            stdout={block.stdout}
            stderr={block.stderr}
            exitCode={block.exitCode}
            timestamp={block.timestamp}
            isRunning={block.isRunning}
            generatedByAi={block.generatedByAi}
            suggestion={block.suggestion}
            onRerun={handleRerun}
            onCopy={handleCopy}
            onKill={handleKill}
            onExplain={handleExplain}
            onApplyFix={handleApplyFix}
          />
        ))}
      </div>

      {/* Input Area */}
      <form className="terminal-input-area" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <span className="input-prompt">
            <span className="cwd">{cwd || '~'}</span>
            <span className="prompt-symbol">❯</span>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAiThinking ? "✨ AI thinking..." : "Type a command... (use ? for AI)"}
            autoFocus
            disabled={isLoading || isAiThinking}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="ai-toggle"
          onClick={() => onOpenAiPanel?.({ type: 'chat' })}
          title="Open AI Assistant (Ctrl+Shift+P)"
        >
          ✨
        </button>
      </form>
    </div>
  );
}


