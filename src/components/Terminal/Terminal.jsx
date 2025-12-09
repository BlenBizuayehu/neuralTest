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
  const inputRef = useRef(null);
  const terminalRef = useRef(null);
  const unlistenRefs = useRef([]);

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
        setCommandBlocks((prev) =>
          prev.map((block) =>
            block.id === id
              ? { ...block, exitCode: exit_code, isRunning: false }
              : block
          )
        );

        // If there's an error, get AI suggestion
        if (exit_code !== 0) {
          const block = commandBlocks.find((b) => b.id === id);
          if (block && block.stderr) {
            try {
              const suggestion = await analyzeError(
                block.stderr,
                exit_code,
                block.command,
                cwd
              );
              setCommandBlocks((prev) =>
                prev.map((b) =>
                  b.id === id ? { ...b, suggestion } : b
                )
              );
            } catch (e) {
              console.error('Failed to get error suggestion:', e);
            }
          }
        }
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
  }, [cwd, commandBlocks]);

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

    setIsLoading(true);
    setInputValue('');
    setHistoryIndex(-1);

    try {
      const result = await runCommand(cmd, cwd, false, false);
      
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
      // Add error block
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
    } finally {
      setIsLoading(false);
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
            placeholder="Type a command..."
            autoFocus
            disabled={isLoading}
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


