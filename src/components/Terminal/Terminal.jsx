import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import CommandBlock from './CommandBlock';
import AIProposal from './AIProposal';
import SecurityWarningModal from '../SecurityWarning/SecurityWarningModal';
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
  getSessionContent,
  nlToCmd,
  resolvePath,
  debugGetCommandCount,
  debugGetSessionCount,
  debugGetRecentCommands,
} from '../../services/tauriClient';

/**
 * Terminal - Main terminal component with command blocks
 */
const Terminal = forwardRef(function Terminal({ cwd, sessionId, onCwdChange, onOpenAiPanel, onCommandExecuted, userId }, ref) {
  const [commandBlocks, setCommandBlocks] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiProposals, setAiProposals] = useState([]); // Store AI proposals for review
  const inputRef = useRef(null);
  const terminalRef = useRef(null);
  const unlistenRefs = useRef([]);
  const pendingAiFallback = useRef(null); // Store original command for AI fallback
  const isSubmittingRef = useRef(false); // Guard against duplicate submissions
  const isMountedRef = useRef(true); // Track if component is mounted
  const pendingCommandIds = useRef(new Set()); // Track command IDs to prevent duplicates
  const [securityWarning, setSecurityWarning] = useState(null); // Security warning state
  const pendingDangerousCommand = useRef(null); // Store command waiting for confirmation

  // Store handleAiFallback in a ref to avoid dependency issues
  const handleAiFallbackRef = useRef(null);
  const prevSessionIdRef = useRef(sessionId); // Track previous sessionId to detect changes

  // Handle AI fallback when command fails
  const handleAiFallback = useCallback(async (originalCmd, errorMsg) => {
    console.log('[AI Fallback] Starting fallback for command:', originalCmd, 'Error:', errorMsg);
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
      console.log('[AI Fallback] Calling nlToCmd with:', originalCmd);
      const response = await nlToCmd(originalCmd, cwd);
      console.log('[AI Fallback] Received response:', response);
      
      if (response.commands && response.commands.length > 0) {
        const aiCommand = response.commands[0];
        
        // Remove thinking message
        setCommandBlocks((prev) => prev.filter((block) => block.id !== thinkingId));
        
        // Create a proposal for user review instead of auto-executing
        const proposalId = Date.now();
        setAiProposals((prev) => [
          ...prev,
          {
            id: proposalId,
            explanation: response.explanation || `AI suggests correcting "${originalCmd}" to:`,
            suggestedCommand: aiCommand,
            confidence: 'high', // Auto-correction is typically high confidence
            warning: response.warning || null,
            source: 'fallback',
          },
        ]);
      } else {
        // Remove thinking message if no commands generated
        setCommandBlocks((prev) => prev.filter((block) => block.id !== thinkingId));
      }
    } catch (error) {
      // Remove thinking message on error
      setCommandBlocks((prev) => prev.filter((block) => block.id !== thinkingId));
      console.error('AI fallback failed:', error);
    } finally {
      setIsAiThinking(false);
      setIsLoading(false);
      isSubmittingRef.current = false; // Reset guard
      // Re-focus input after AI fallback completes
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [cwd, sessionId, onCommandExecuted]);

  // Keep ref in sync with the latest function
  useEffect(() => {
    handleAiFallbackRef.current = handleAiFallback;
  }, [handleAiFallback]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
    
    // Debug: Check database state
    debugGetCommandCount().then(count => {
      console.log('[DEBUG] Total commands in DB:', count);
    }).catch(e => console.error('[DEBUG] Failed to get command count:', e));
    
    debugGetSessionCount().then(count => {
      console.log('[DEBUG] Commands with session_id:', count);
    }).catch(e => console.error('[DEBUG] Failed to get session count:', e));
    
    debugGetRecentCommands(5).then(commands => {
      console.log('[DEBUG] Recent 5 commands:', commands.map(c => ({
        id: c[0],
        session_id: c[1],
        command: c[2]
      })));
    }).catch(e => console.error('[DEBUG] Failed to get recent commands:', e));
  }, []);

  // Set up event listeners - FIXED: Proper async handling to prevent race conditions
  useEffect(() => {
    isMountedRef.current = true;
    
    // Store unlisten functions in local variables (not ref array) for proper cleanup
    let unlistenStdout = null;
    let unlistenStderr = null;
    let unlistenExit = null;
    let unlistenStarted = null;
    let isSetupComplete = false;
    let isCleanedUp = false;

    const setupListeners = async () => {
      // Check if cleanup already ran before setup completed
      if (isCleanedUp || !isMountedRef.current) {
        return;
      }

      try {
        // Command stdout
        unlistenStdout = await onCommandStdout(({ id, chunk }) => {
          if (!isMountedRef.current || isCleanedUp) return;
          setCommandBlocks((prev) =>
            prev.map((block) =>
              block.id === id
                ? { ...block, stdout: (block.stdout || '') + chunk }
                : block
            )
          );
        });

        // Check again after async operation
        if (isCleanedUp || !isMountedRef.current) {
          if (unlistenStdout) unlistenStdout();
          return;
        }

        // Command stderr
        unlistenStderr = await onCommandStderr(({ id, chunk }) => {
          if (!isMountedRef.current || isCleanedUp) return;
          setCommandBlocks((prev) =>
            prev.map((block) =>
              block.id === id
                ? { ...block, stderr: (block.stderr || '') + chunk }
                : block
            )
          );
        });

        if (isCleanedUp || !isMountedRef.current) {
          if (unlistenStdout) unlistenStdout();
          if (unlistenStderr) unlistenStderr();
          return;
        }

        // Command exit
        unlistenExit = await onCommandExit(async ({ id, exit_code }) => {
          if (!isMountedRef.current || isCleanedUp) return;
          
          // DEBUG: Log exit code
          console.log('[Command Exit] Command ID:', id, 'Exit Code:', exit_code);
          
          // Remove from pending set when command exits
          pendingCommandIds.current.delete(id);
          
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

                console.log('[Error Analysis] Command:', block.command, 'Error Text:', errorText.substring(0, 100), 'Is Not Recognized:', isNotRecognized);

                // Check if this was a pending AI fallback candidate
                if (isNotRecognized && pendingAiFallback.current && pendingAiFallback.current.commandId === id) {
                  const originalCmd = pendingAiFallback.current.originalCmd;
                  pendingAiFallback.current = null;
                  
                  console.log('[AI Fallback] Triggering fallback for command:', originalCmd);
                  
                  // Trigger AI fallback asynchronously - use ref to get latest function
                  setTimeout(() => {
                    if (isMountedRef.current && !isCleanedUp && handleAiFallbackRef.current) {
                      handleAiFallbackRef.current(originalCmd, block.stderr || 'Command not found');
                    }
                  }, 100);
                } else if (block.stderr && !isNotRecognized) {
                  // For other errors, get AI error analysis
                  console.log('[AI Analysis] Requesting error analysis for command:', block.command);
                  
                  analyzeError(
                    block.stderr,
                    exit_code,
                    block.command,
                    cwd
                  ).then((suggestion) => {
                    console.log('[AI Analysis] Received suggestion:', suggestion);
                    if (isMountedRef.current && !isCleanedUp) {
                      setCommandBlocks((prev) =>
                        prev.map((b) =>
                          b.id === id ? { ...b, suggestion } : b
                        )
                      );
                    }
                  }).catch((e) => {
                    const errorStr = e.toString();
                    console.error('[AI Analysis] Failed to get error suggestion:', e);
                    console.error('[AI Analysis] Error details:', {
                      command: block.command,
                      exitCode: exit_code,
                      stderr: block.stderr?.substring(0, 200),
                      error: errorStr,
                    });
                    
                    // Show the actual error message to the user instead of a mock response
                    if (isMountedRef.current && !isCleanedUp) {
                      const errorSuggestion = {
                        explanation: `AI Error: ${errorStr}`,
                        fix: null,
                        fixes: [],
                        confidence: 0.0,
                      };
                      
                      // Apply error suggestion to the block
                      setCommandBlocks((prev) =>
                        prev.map((b) =>
                          b.id === id ? { ...b, suggestion: errorSuggestion } : b
                        )
                      );
                    }
                  });
                } else {
                  console.log('[Error Analysis] No AI analysis triggered. Block stderr:', block.stderr ? 'present' : 'empty', 'Is Not Recognized:', isNotRecognized);
                }
              } else {
                console.warn('[Command Exit] Block not found for ID:', id);
              }
            }

            return updated;
          });
          
          // Reset loading state and guard when command exits
          setIsLoading(false);
          isSubmittingRef.current = false;
          
          // Re-focus input after command exits
          setTimeout(() => {
            if (isMountedRef.current && !isCleanedUp) {
              inputRef.current?.focus();
            }
          }, 50);
        });

        if (isCleanedUp || !isMountedRef.current) {
          if (unlistenStdout) unlistenStdout();
          if (unlistenStderr) unlistenStderr();
          if (unlistenExit) unlistenExit();
          return;
        }

        // Command started - FIXED: Prevent duplicate blocks
        unlistenStarted = await onCommandStarted(({ id, command_text, timestamp }) => {
          if (!isMountedRef.current || isCleanedUp) return;
          
          // Check if we already have this command ID (prevent duplicates)
          if (pendingCommandIds.current.has(id)) {
            // Block already exists, just update it if needed
            setCommandBlocks((prev) => {
              const exists = prev.some((b) => b.id === id);
              if (exists) {
                // Block exists, just ensure it's marked as running
                return prev.map((block) =>
                  block.id === id && !block.isRunning
                    ? { ...block, isRunning: true }
                    : block
                );
              }
              return prev;
            });
            return;
          }
          
          // Mark this ID as pending to prevent duplicates
          pendingCommandIds.current.add(id);
          
          // Only create block if it doesn't exist (shouldn't happen, but safety check)
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

        // Mark setup as complete only if we didn't get cleaned up
        if (!isCleanedUp && isMountedRef.current) {
          isSetupComplete = true;
        } else {
          // Cleanup was called during setup, clean up what we have
          if (unlistenStdout) unlistenStdout();
          if (unlistenStderr) unlistenStderr();
          if (unlistenExit) unlistenExit();
          if (unlistenStarted) unlistenStarted();
        }
      } catch (error) {
        console.error('[Setup Listeners] Error setting up listeners:', error);
        // Clean up any listeners that were set up before the error
        if (unlistenStdout) unlistenStdout();
        if (unlistenStderr) unlistenStderr();
        if (unlistenExit) unlistenExit();
        if (unlistenStarted) unlistenStarted();
      }
    };

    // Start async setup
    setupListeners();

    // Cleanup function - properly unlisten all events
    return () => {
      isCleanedUp = true;
      isMountedRef.current = false;
      
      // Clean up all listeners (whether setup completed or not)
      if (unlistenStdout && typeof unlistenStdout === 'function') {
        unlistenStdout();
      }
      if (unlistenStderr && typeof unlistenStderr === 'function') {
        unlistenStderr();
      }
      if (unlistenExit && typeof unlistenExit === 'function') {
        unlistenExit();
      }
      if (unlistenStarted && typeof unlistenStarted === 'function') {
        unlistenStarted();
      }
      
      // Clear pending command IDs on cleanup (React.StrictMode safety)
      pendingCommandIds.current.clear();
    };
  }, [cwd]); // Removed handleAiFallback from dependencies - using ref instead

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
    
    // Prevent duplicate submissions
    if (isLoading || isAiThinking || isSubmittingRef.current) {
      return;
    }
    
    const cmd = inputValue.trim();
    if (!cmd) return;
    
    // Set guard flag
    isSubmittingRef.current = true;

    // Check for cd command - Smart Directory Tracking
    if (cmd === 'cd' || cmd.startsWith('cd ')) {
      const targetDir = cmd === 'cd' ? '~' : cmd.slice(3).trim();
      
      // Resolve the path using backend validator
      try {
        const resolvedPath = await resolvePath(cwd || '.', targetDir);
        
        // Update the CWD state
        onCwdChange?.(resolvedPath);
        
        // Show success message in command block
        const cdBlockId = Date.now();
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: cdBlockId,
            command: cmd,
            timestamp: new Date().toISOString(),
            isRunning: false,
            stdout: `Changed directory to ${resolvedPath}`,
            stderr: '',
            exitCode: 0,
          },
        ]);
        
        // Update history
        setCommandHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 100));
      } catch (error) {
        // Show error message if path doesn't exist
        const cdBlockId = Date.now();
        setCommandBlocks((prev) => [
          ...prev,
          {
            id: cdBlockId,
            command: cmd,
            timestamp: new Date().toISOString(),
            isRunning: false,
            stdout: '',
            stderr: `cd: ${error.toString()}`,
            exitCode: 1,
          },
        ]);
        
        // Update history even on error
        setCommandHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 100));
      }
      
      setInputValue('');
      isSubmittingRef.current = false; // Reset guard
      inputRef.current?.focus(); // Re-focus input
      return;
    }

    // Check for clear command
    if (cmd === 'clear' || cmd === 'cls') {
      setCommandBlocks([]);
      setInputValue('');
      isSubmittingRef.current = false; // Reset guard
      inputRef.current?.focus(); // Re-focus input
      return;
    }

    // Step A: Check for AI trigger character (? or /)
    if (cmd.startsWith('?') || cmd.startsWith('/')) {
      const aiPrompt = cmd.slice(1).trim();
      if (aiPrompt) {
        await handleAiCommand(aiPrompt);
      }
      setInputValue('');
      isSubmittingRef.current = false; // Reset guard
      inputRef.current?.focus(); // Re-focus input
      return;
    }

    setIsLoading(true);
    setInputValue('');
    setHistoryIndex(-1);

    // Step B: Try to execute the command normally
    try {
      const result = await runCommand(cmd, cwd, false, false, false, sessionId, userId);
      
      // Store original command for potential AI fallback
      pendingAiFallback.current = { originalCmd: cmd, commandId: result.id };
      
      // Mark this command ID as pending to prevent duplicates from command_started event
      pendingCommandIds.current.add(result.id);
      
      // Add command block optimistically (before command_started event)
      setCommandBlocks((prev) => {
        // Double-check: ensure we don't add a duplicate
        const exists = prev.some((b) => b.id === result.id);
        if (exists) return prev;
        
        return [
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
        ];
      });

      // Update history
      setCommandHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 100));
    } catch (error) {
      const errorStr = error.toString();
      
      // Check for security warning
      if (errorStr.startsWith('SECURITY_WARNING:')) {
        // Parse the warning: SECURITY_WARNING:reason:severity:command
        const parts = errorStr.split(':');
        if (parts.length >= 4) {
          const reason = parts[1];
          const severity = parts[2];
          const commandText = parts.slice(3).join(':'); // Rejoin in case command contains colons
          
          // Store the command for confirmation
          pendingDangerousCommand.current = cmd;
          
          // Show security warning modal
          setSecurityWarning({
            reason,
            severity,
            command: commandText || cmd,
          });
          
          setIsLoading(false);
          isSubmittingRef.current = false;
          return; // Don't show error block, modal handles it
        }
      }
      
      // If command fails to start, try AI fallback immediately
      const errorLower = errorStr.toLowerCase();
      if (errorLower.includes('not recognized') || errorLower.includes('command not found') || errorLower.includes('not found')) {
        await handleAiFallback(cmd, errorStr);
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
            stderr: errorStr,
            exitCode: 1,
          },
        ]);
      }
      setIsLoading(false);
      isSubmittingRef.current = false; // Reset guard immediately
      // Re-focus input after error
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } finally {
      // Reset guard flag after a short delay to prevent rapid re-submissions
      // (only if not already reset in catch block)
      if (isSubmittingRef.current) {
        setTimeout(() => {
          isSubmittingRef.current = false;
        }, 100);
      }
    }
  };

  // Handle AI command (triggered by ? or /)
  const handleAiCommand = async (prompt) => {
    setIsAiThinking(true);
    try {
      const response = await nlToCmd(prompt, cwd);
      
      if (response.commands && response.commands.length > 0) {
        // Create a proposal for user review instead of auto-executing
        const aiCommand = response.commands[0];
        const proposalId = Date.now();
        
        setAiProposals((prev) => [
          ...prev,
          {
            id: proposalId,
            explanation: response.explanation || `AI generated command for: "${prompt}"`,
            suggestedCommand: aiCommand,
            confidence: 'medium', // User-initiated commands are medium confidence
            warning: response.warning || null,
            source: 'ai',
          },
        ]);
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

  const handleExplain = async (command, output = null) => {
    if (output) {
      // If output is provided, use chat mode with a specific prompt about the output
      onOpenAiPanel?.({ 
        type: 'chat', 
        initialMessage: `Explain this terminal output for the command '${command}':\n\n${output}` 
      });
    } else {
      // If no output, use the explain mode for the command itself
      onOpenAiPanel?.({ type: 'explain', command });
    }
  };

  const handleApplyFix = async (fix) => {
    if (!fix || !fix.trim()) return;
    
    // Execute the fix command immediately
    setIsLoading(true);
    setInputValue('');
    setHistoryIndex(-1);
    
    try {
      const result = await runCommand(fix.trim(), cwd, false, false, false, sessionId, userId);
      
      // Mark this command ID as pending to prevent duplicates
      pendingCommandIds.current.add(result.id);
      
      // Add command block optimistically
      setCommandBlocks((prev) => {
        const exists = prev.some((b) => b.id === result.id);
        if (exists) return prev;
        
        return [
          ...prev,
          {
            id: result.id,
            command: fix.trim(),
            timestamp: result.timestamp,
            isRunning: true,
            stdout: '',
            stderr: '',
            exitCode: null,
            generatedByAi: true, // Mark as AI-generated fix
          },
        ];
      });
      
      // Update history
      setCommandHistory((prev) => [fix.trim(), ...prev.filter((c) => c !== fix.trim())].slice(0, 100));
      
      // Notify parent that a command was executed
      if (onCommandExecuted) {
        onCommandExecuted();
      }
    } catch (error) {
      const errorStr = error.toString();
      
      // Check for security warning
      if (errorStr.startsWith('SECURITY_WARNING:')) {
        const parts = errorStr.split(':');
        if (parts.length >= 4) {
          const reason = parts[1];
          const severity = parts[2];
          const commandText = parts.slice(3).join(':');
          
          pendingDangerousCommand.current = fix.trim();
          
          setSecurityWarning({
            reason,
            severity,
            command: commandText || fix.trim(),
          });
          
          setIsLoading(false);
          return;
        }
      }
      
      // Other errors
      setCommandBlocks((prev) => [
        ...prev,
        {
          id: Date.now(),
          command: fix.trim(),
          timestamp: new Date().toISOString(),
          isRunning: false,
          stdout: '',
          stderr: errorStr,
          exitCode: 1,
          generatedByAi: true,
        },
      ]);
      setIsLoading(false);
    }
    
    // Re-focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleCopy = () => {
    // Visual feedback could be added here
  };

  // Handle running a proposal command
  const handleRunProposal = async (command) => {
    // Remove the proposal
    setAiProposals((prev) => prev.filter((p) => p.suggestedCommand !== command));
    
    // Execute the command
    setIsLoading(true);
    try {
      const result = await runCommand(command, cwd, true, false, false, sessionId, userId);
      
      pendingCommandIds.current.add(result.id);
      
      setCommandBlocks((prev) => {
        const exists = prev.some((b) => b.id === result.id);
        if (exists) return prev;
        
        return [
          ...prev,
          {
            id: result.id,
            command,
            timestamp: result.timestamp,
            isRunning: true,
            stdout: '',
            stderr: '',
            exitCode: null,
            generatedByAi: true,
          },
        ];
      });

      setCommandHistory((prev) => [command, ...prev.filter((c) => c !== command)].slice(0, 100));
      
      if (onCommandExecuted) {
        onCommandExecuted();
      }
      
      setIsLoading(false);
    } catch (error) {
      const errorStr = error.toString();
      
      // Check for security warning
      if (errorStr.startsWith('SECURITY_WARNING:')) {
        const parts = errorStr.split(':');
        if (parts.length >= 4) {
          const reason = parts[1];
          const severity = parts[2];
          const commandText = parts.slice(3).join(':');
          
          pendingDangerousCommand.current = command;
          
          setSecurityWarning({
            reason,
            severity,
            command: commandText || command,
          });
          
          setIsLoading(false);
          return;
        }
      }
      
      // Show error block
      setCommandBlocks((prev) => [
        ...prev,
        {
          id: Date.now(),
          command,
          timestamp: new Date().toISOString(),
          isRunning: false,
          stdout: '',
          stderr: errorStr,
          exitCode: 1,
          generatedByAi: true,
        },
      ]);
      
      setIsLoading(false);
    }
    
    // Re-focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Handle dismissing a proposal
  const handleDismissProposal = (proposalId) => {
    setAiProposals((prev) => prev.filter((p) => p.id !== proposalId));
    // Re-focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Handle security warning confirmation
  const handleSecurityConfirm = useCallback(async () => {
    if (!pendingDangerousCommand.current) {
      setSecurityWarning(null);
      return;
    }

    const cmd = pendingDangerousCommand.current;
    pendingDangerousCommand.current = null;
    setSecurityWarning(null);

    // Re-execute with force=true
    setIsLoading(true);
    try {
      const result = await runCommand(cmd, cwd, false, true, false, sessionId, userId); // force=true
      
      // Store original command for potential AI fallback
      pendingAiFallback.current = { originalCmd: cmd, commandId: result.id };
      
      // Mark this command ID as pending to prevent duplicates
      pendingCommandIds.current.add(result.id);
      
      // Add command block
      setCommandBlocks((prev) => {
        const exists = prev.some((b) => b.id === result.id);
        if (exists) return prev;
        
        return [
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
        ];
      });

      // Update history
      setCommandHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 100));
      
      // Notify parent that a command was executed
      if (onCommandExecuted) {
        onCommandExecuted();
      }
    } catch (error) {
      // Handle error (shouldn't happen with force=true, but safety check)
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
      setIsLoading(false);
    }
    isSubmittingRef.current = false;
  }, [cwd, sessionId]);

  const handleSecurityCancel = useCallback(() => {
    pendingDangerousCommand.current = null;
    setSecurityWarning(null);
    setIsLoading(false);
    isSubmittingRef.current = false;
    // Re-focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  // Load session content
  const loadSession = useCallback(async (targetSessionId) => {
    try {
      const sessionContent = await getSessionContent(targetSessionId);
      // Convert session content to command blocks
      const blocks = sessionContent.map((cmd) => ({
        id: cmd.id || Date.now() + Math.random(),
        command: cmd.command_text,
        timestamp: cmd.timestamp,
        isRunning: false,
        stdout: cmd.stdout || '',
        stderr: cmd.stderr || '',
        exitCode: cmd.exit_code,
        generatedByAi: cmd.generated_by_ai,
      }));
      setCommandBlocks(blocks);
      // Update command history for arrow key navigation
      const commands = sessionContent.map((cmd) => cmd.command_text);
      setCommandHistory(commands);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, []);

  // Reset session (clear blocks)
  const resetSession = useCallback(() => {
    setCommandBlocks([]);
    setCommandHistory([]);
    setInputValue('');
    setHistoryIndex(-1);
  }, []);

  // Load session when sessionId changes (but not on initial mount to avoid double-loading)
  useEffect(() => {
    // Only load if sessionId actually changed (not initial mount)
    if (sessionId && sessionId !== prevSessionIdRef.current) {
      console.log('[Terminal] Session ID changed, loading session:', sessionId);
      loadSession(sessionId);
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId, loadSession]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    insertCommand: (command) => {
      setInputValue(command);
      inputRef.current?.focus();
      // Move cursor to end
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(command.length, command.length);
        }
      }, 0);
    },
    resetSession,
    loadSession,
  }));

  return (
    <div className="terminal" ref={terminalRef}>
      <div className="terminal-content">
        {/* Welcome Message */}
        {commandBlocks.length === 0 && (
          <div className="welcome-message">
            <h2>Welcome to Neural</h2>
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

        {/* AI Proposals (Review before Execute) - Rendered at bottom for most recent */}
        {aiProposals.map((proposal) => (
          <AIProposal
            key={proposal.id}
            id={proposal.id}
            explanation={proposal.explanation}
            suggestedCommand={proposal.suggestedCommand}
            confidence={proposal.confidence}
            warning={proposal.warning}
            source={proposal.source}
            onRun={handleRunProposal}
            onDismiss={() => handleDismissProposal(proposal.id)}
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

      {/* Security Warning Modal */}
      <SecurityWarningModal
        isOpen={securityWarning !== null}
        warning={securityWarning}
        command={pendingDangerousCommand.current}
        onConfirm={handleSecurityConfirm}
        onCancel={handleSecurityCancel}
      />
    </div>
  );
});

export default Terminal;

