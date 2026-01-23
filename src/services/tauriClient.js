/**
 * Tauri Client Service
 * Wrapper for Tauri invoke and event listeners
 */

// Generate UUID v4 (fallback for session ID generation)
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

// Get or create a persistent session ID from localStorage
function getOrCreateSessionId() {
  const stored = localStorage.getItem('current_session_id');
  if (stored && stored.trim() !== '') {
    return stored;
  }
  const newId = generateUUID();
  localStorage.setItem('current_session_id', newId);
  return newId;
}

// Try to import Tauri API - use dynamic import as fallback if static import fails
let tauriInvoke, tauriListen;

// Static import attempt
try {
  // Use dynamic import to handle cases where module might not be available
  import('@tauri-apps/api/core').then(module => {
    tauriInvoke = module.invoke;
  }).catch(() => {
    // Will fall back to dynamic import in functions
  });
  
  import('@tauri-apps/api/event').then(module => {
    tauriListen = module.listen;
  }).catch(() => {
    // Will fall back to dynamic import in functions
  });
} catch (e) {
  // Static import failed, will use dynamic import
}

// Function to get invoke, loading it if needed
async function getInvoke() {
  if (!tauriInvoke || typeof tauriInvoke !== 'function') {
    try {
      const coreModule = await import('@tauri-apps/api/core');
      tauriInvoke = coreModule.invoke;
      if (!tauriInvoke || typeof tauriInvoke !== 'function') {
        throw new Error('invoke is not a function');
      }
    } catch (error) {
      console.error('Failed to load Tauri core API:', error);
      throw new Error('Tauri API is not available. Make sure you are running in a Tauri environment.');
    }
  }
  return tauriInvoke;
}

// Function to get listen, loading it if needed
async function getListen() {
  if (!tauriListen || typeof tauriListen !== 'function') {
    try {
      const eventModule = await import('@tauri-apps/api/event');
      tauriListen = eventModule.listen;
      if (!tauriListen || typeof tauriListen !== 'function') {
        throw new Error('listen is not a function');
      }
    } catch (error) {
      console.error('Failed to load Tauri event API:', error);
      throw new Error('Tauri API is not available. Make sure you are running in a Tauri environment.');
    }
  }
  return tauriListen;
}

// Helper to safely call invoke with error handling
async function safeInvoke(cmd, args = {}) {
  try {
    const invokeFn = await getInvoke();
    return await invokeFn(cmd, args);
  } catch (error) {
    console.error(`Tauri invoke error for ${cmd}:`, error);
    throw error;
  }
}

// ============ Natural Language ============

/**
 * Convert natural language to shell command(s)
 */
export async function nlToCmd(text, cwd = null) {
  return safeInvoke('nl_to_cmd', { text, cwd });
}

// ============ Command Execution ============

/**
 * Run a shell command
 */
export async function runCommand(command, cwd = null, generatedByAi = false, force = false, saveHistory = null, sessionId = null, userId = null) {
  // Get user_id from localStorage if not provided
  if (userId === null) {
    const storedUserId = localStorage.getItem('userId');
    userId = storedUserId ? parseInt(storedUserId, 10) : null;
  }
  
  // Defensive strategy: Ensure sessionId is always provided
  // Priority: 1. Passed argument, 2. localStorage, 3. Generate new
  let finalSessionId = sessionId;
  let sessionIdSource = 'Provided';
  
  // Step 1: Use passed argument FIRST (highest priority)
  if (finalSessionId && finalSessionId !== null && finalSessionId !== undefined && finalSessionId.trim() !== '') {
    // Valid sessionId provided - update localStorage to keep it in sync
    localStorage.setItem('current_session_id', finalSessionId);
    sessionIdSource = 'Provided';
  } else {
    // Step 2: Try localStorage
    const storedId = localStorage.getItem('current_session_id');
    if (storedId && storedId.trim() !== '') {
      finalSessionId = storedId;
      sessionIdSource = 'Fallback (localStorage)';
    } else {
      // Step 3: Generate new UUID
      finalSessionId = generateUUID();
      localStorage.setItem('current_session_id', finalSessionId);
      sessionIdSource = 'Generated (new)';
    }
  }
  
  // Use camelCase - Tauri automatically maps to snake_case for Rust
  const payload = {
    command,
    cwd,
    generatedByAi,
    force,
    saveHistory,
    sessionId: finalSessionId,
    userId, // Pass user_id - null for Guest mode, number for User mode
  };
  
  // Debug logging
  console.log('[IPC Defensive] Using Session ID:', finalSessionId, `(${sessionIdSource})`);
  console.log('[IPC Defensive] Full payload:', {
    command,
    sessionId: finalSessionId,
    saveHistory,
    generatedByAi,
    userId,
    source: sessionIdSource,
  });
  
  return safeInvoke('run_command', payload);
}

/**
 * Kill a running command
 */
export async function killCommand(id) {
  return safeInvoke('kill_command', { id });
}

/**
 * Get list of running command IDs
 */
export async function getRunningCommands() {
  return safeInvoke('get_running_commands');
}

// ============ Context ============

/**
 * Get project context for a directory
 */
export async function getContext(cwd = null) {
  return safeInvoke('get_context', { cwd });
}

/**
 * Find the project root directory
 */
export async function findProjectRoot(start = null) {
  return safeInvoke('find_project_root', { start });
}

/**
 * Get the system home directory
 */
export async function getHomeDirectory() {
  return safeInvoke('get_home_directory');
}

/**
 * Resolve a path relative to the current directory
 */
export async function resolvePath(current, target) {
  return safeInvoke('resolve_path', { current, target });
}

// ============ Authentication ============

/**
 * Register a new user
 */
export async function register(email, password) {
  return safeInvoke('register', { email, password });
}

/**
 * Login a user - returns [userId, isVerified]
 */
export async function login(email, password) {
  return safeInvoke('login', { email, password });
}

/**
 * Verify email with code
 */
export async function verifyEmail(email, code) {
  return safeInvoke('verify_email', { email, code });
}

/**
 * Request password reset code
 */
export async function requestPasswordReset(email) {
  return safeInvoke('request_password_reset', { email });
}

/**
 * Reset password with code
 */
export async function resetPassword(email, code, newPassword) {
  return safeInvoke('reset_password', { email, code, newPassword });
}

// ============ AI Features ============

/**
 * Analyze an error and get fix suggestions
 */
export async function analyzeError(stderr, exitCode, command, cwd = null) {
  return safeInvoke('analyze_error', { stderr, exitCode, command, cwd });
}

/**
 * Explain a command in detail
 */
export async function explainCommand(command, cwd = null) {
  return safeInvoke('explain_command', { command, cwd });
}

/**
 * Check if AI is configured
 */
export async function isAiConfigured() {
  return safeInvoke('is_ai_configured');
}

/**
 * Set API key for current provider
 */
export async function setApiKey(key) {
  return safeInvoke('set_api_key', { key });
}

/**
 * Set Gemini API key
 */
export async function setGeminiApiKey(key) {
  return safeInvoke('set_gemini_api_key', { key });
}

/**
 * Set OpenAI API key
 */
export async function setOpenaiApiKey(key) {
  return safeInvoke('set_openai_api_key', { key });
}

/**
 * Set Groq API key
 */
export async function setGroqApiKey(key) {
  return safeInvoke('set_groq_api_key', { key });
}

/**
 * Set AI provider (gemini, openai, or groq)
 */
export async function setAiProvider(provider) {
  return safeInvoke('set_ai_provider', { provider });
}

/**
 * Set AI model
 */
export async function setAiModel(model) {
  return safeInvoke('set_ai_model', { model });
}

/**
 * Clear API key for current provider
 */
export async function clearApiKey() {
  return safeInvoke('clear_api_key');
}

// ============ Workflows ============

/**
 * Run a workflow
 */
export async function runWorkflow(definition, cwd = null, workflowId = null) {
  return safeInvoke('run_workflow', { definition, cwd, workflowId });
}

/**
 * Create a new workflow
 */
export async function createWorkflow(name, description, steps) {
  return safeInvoke('create_workflow', { name, description, steps });
}

/**
 * Get all saved workflows
 */
export async function getWorkflows() {
  return safeInvoke('get_workflows');
}

/**
 * Generate a workflow from natural language
 */
export async function generateWorkflow(description, cwd = null) {
  return safeInvoke('generate_workflow', { description, cwd });
}

// ============ History & Preferences ============

/**
 * Get command history (only works if authenticated)
 */
export async function getHistory(limit = 100, offset = 0) {
  // Only fetch history if authenticated
  if (localStorage.getItem('isAuthenticated') !== 'true') {
    return [];
  }
  return safeInvoke('get_history', { limit, offset });
}

/**
 * Get all sessions for the current user
 */
export async function getSessions() {
  // Get user_id from localStorage
  const userId = localStorage.getItem('userId');
  if (!userId) {
    return []; // Guest mode - no sessions
  }
  return safeInvoke('get_sessions', { userId: parseInt(userId, 10) });
}

/**
 * Get all commands for a specific session
 */
export async function getSessionContent(sessionId) {
  return safeInvoke('get_session_content', { sessionId });
}

// ============ Debug Commands ============

/**
 * Debug: Get total command count
 */
export async function debugGetCommandCount() {
  return safeInvoke('debug_get_command_count');
}

/**
 * Debug: Get session count
 */
export async function debugGetSessionCount() {
  return safeInvoke('debug_get_session_count');
}

/**
 * Debug: Get recent commands with session_ids
 */
export async function debugGetRecentCommands(limit = 10) {
  return safeInvoke('debug_get_recent_commands', { limit });
}

/**
 * Get AI suggestions for a command
 */
export async function getSuggestionsForCommand(commandId) {
  return safeInvoke('get_suggestions_for_command', { commandId });
}

/**
 * Get a preference value
 */
export async function getPreference(key) {
  return safeInvoke('get_preference', { key });
}

/**
 * Set a preference value
 */
export async function setPreference(key, value) {
  return safeInvoke('set_preference', { key, value });
}

/**
 * Get all preferences
 */
export async function getAllPreferences() {
  return safeInvoke('get_all_preferences');
}

// ============ Security ============

/**
 * Validate a command for safety
 */
export async function validateCommand(command) {
  return safeInvoke('validate_command', { command });
}

/**
 * Check if command is interactive
 */
export async function isInteractiveCommand(command) {
  return safeInvoke('is_interactive_command', { command });
}

/**
 * Redact sensitive information
 */
export async function redactSensitive(text) {
  return safeInvoke('redact_sensitive', { text });
}

// ============ Event Listeners ============

/**
 * Listen for command stdout
 */
export async function onCommandStdout(callback) {
  const listenFn = await getListen();
  return listenFn('command_stdout', (event) => callback(event.payload));
}

/**
 * Listen for command stderr
 */
export async function onCommandStderr(callback) {
  const listenFn = await getListen();
  return listenFn('command_stderr', (event) => callback(event.payload));
}

/**
 * Listen for command exit
 */
export async function onCommandExit(callback) {
  const listenFn = await getListen();
  return listenFn('command_exit', (event) => callback(event.payload));
}

/**
 * Listen for command started
 */
export async function onCommandStarted(callback) {
  const listenFn = await getListen();
  return listenFn('command_started', (event) => callback(event.payload));
}

/**
 * Listen for error suggestion
 */
export async function onErrorSuggestion(callback) {
  const listenFn = await getListen();
  return listenFn('error_suggestion', (event) => callback(event.payload));
}

/**
 * Listen for workflow step start
 */
export async function onWorkflowStepStart(callback) {
  const listenFn = await getListen();
  return listenFn('workflow_step_start', (event) => callback(event.payload));
}

/**
 * Listen for workflow step complete
 */
export async function onWorkflowStepComplete(callback) {
  const listenFn = await getListen();
  return listenFn('workflow_step_complete', (event) => callback(event.payload));
}

/**
 * Listen for workflow failed
 */
export async function onWorkflowFailed(callback) {
  const listenFn = await getListen();
  return listenFn('workflow_failed', (event) => callback(event.payload));
}

/**
 * Listen for workflow complete
 */
export async function onWorkflowComplete(callback) {
  const listenFn = await getListen();
  return listenFn('workflow_complete', (event) => callback(event.payload));
}

export default {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  nlToCmd,
  runCommand,
  killCommand,
  getRunningCommands,
  getContext,
  findProjectRoot,
  getHomeDirectory,
  resolvePath,
  analyzeError,
  explainCommand,
  isAiConfigured,
  setApiKey,
  setAiModel,
  runWorkflow,
  createWorkflow,
  getWorkflows,
  generateWorkflow,
  getHistory,
  getSuggestionsForCommand,
  getPreference,
  setPreference,
  getAllPreferences,
  validateCommand,
  isInteractiveCommand,
  redactSensitive,
  onCommandStdout,
  onCommandStderr,
  onCommandExit,
  onCommandStarted,
  onErrorSuggestion,
  onWorkflowStepStart,
  onWorkflowStepComplete,
  onWorkflowFailed,
  onWorkflowComplete,
};


