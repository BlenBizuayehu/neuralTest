/**
 * Tauri Client Service
 * Wrapper for Tauri invoke and event listeners
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ============ Natural Language ============

/**
 * Convert natural language to shell command(s)
 */
export async function nlToCmd(text, cwd = null) {
  return invoke('nl_to_cmd', { text, cwd });
}

// ============ Command Execution ============

/**
 * Run a shell command
 */
export async function runCommand(command, cwd = null, generatedByAi = false, force = false) {
  return invoke('run_command', { command, cwd, generatedByAi, force });
}

/**
 * Kill a running command
 */
export async function killCommand(id) {
  return invoke('kill_command', { id });
}

/**
 * Get list of running command IDs
 */
export async function getRunningCommands() {
  return invoke('get_running_commands');
}

// ============ Context ============

/**
 * Get project context for a directory
 */
export async function getContext(cwd = null) {
  return invoke('get_context', { cwd });
}

/**
 * Find the project root directory
 */
export async function findProjectRoot(start = null) {
  return invoke('find_project_root', { start });
}

// ============ AI Features ============

/**
 * Analyze an error and get fix suggestions
 */
export async function analyzeError(stderr, exitCode, command, cwd = null) {
  return invoke('analyze_error', { stderr, exitCode, command, cwd });
}

/**
 * Explain a command in detail
 */
export async function explainCommand(command, cwd = null) {
  return invoke('explain_command', { command, cwd });
}

/**
 * Check if AI is configured
 */
export async function isAiConfigured() {
  return invoke('is_ai_configured');
}

/**
 * Set API key for current provider
 */
export async function setApiKey(key) {
  return invoke('set_api_key', { key });
}

/**
 * Set Gemini API key
 */
export async function setGeminiApiKey(key) {
  return invoke('set_gemini_api_key', { key });
}

/**
 * Set OpenAI API key
 */
export async function setOpenaiApiKey(key) {
  return invoke('set_openai_api_key', { key });
}

/**
 * Set AI provider (gemini or openai)
 */
export async function setAiProvider(provider) {
  return invoke('set_ai_provider', { provider });
}

/**
 * Set AI model
 */
export async function setAiModel(model) {
  return invoke('set_ai_model', { model });
}

/**
 * Clear API key for current provider
 */
export async function clearApiKey() {
  return invoke('clear_api_key');
}

// ============ Workflows ============

/**
 * Run a workflow
 */
export async function runWorkflow(definition, cwd = null, workflowId = null) {
  return invoke('run_workflow', { definition, cwd, workflowId });
}

/**
 * Create a new workflow
 */
export async function createWorkflow(name, description, steps) {
  return invoke('create_workflow', { name, description, steps });
}

/**
 * Get all saved workflows
 */
export async function getWorkflows() {
  return invoke('get_workflows');
}

/**
 * Generate a workflow from natural language
 */
export async function generateWorkflow(description, cwd = null) {
  return invoke('generate_workflow', { description, cwd });
}

// ============ History & Preferences ============

/**
 * Get command history
 */
export async function getHistory(limit = 100, offset = 0) {
  return invoke('get_history', { limit, offset });
}

/**
 * Get AI suggestions for a command
 */
export async function getSuggestionsForCommand(commandId) {
  return invoke('get_suggestions_for_command', { commandId });
}

/**
 * Get a preference value
 */
export async function getPreference(key) {
  return invoke('get_preference', { key });
}

/**
 * Set a preference value
 */
export async function setPreference(key, value) {
  return invoke('set_preference', { key, value });
}

/**
 * Get all preferences
 */
export async function getAllPreferences() {
  return invoke('get_all_preferences');
}

// ============ Security ============

/**
 * Validate a command for safety
 */
export async function validateCommand(command) {
  return invoke('validate_command', { command });
}

/**
 * Check if command is interactive
 */
export async function isInteractiveCommand(command) {
  return invoke('is_interactive_command', { command });
}

/**
 * Redact sensitive information
 */
export async function redactSensitive(text) {
  return invoke('redact_sensitive', { text });
}

// ============ Event Listeners ============

/**
 * Listen for command stdout
 */
export function onCommandStdout(callback) {
  return listen('command_stdout', (event) => callback(event.payload));
}

/**
 * Listen for command stderr
 */
export function onCommandStderr(callback) {
  return listen('command_stderr', (event) => callback(event.payload));
}

/**
 * Listen for command exit
 */
export function onCommandExit(callback) {
  return listen('command_exit', (event) => callback(event.payload));
}

/**
 * Listen for command started
 */
export function onCommandStarted(callback) {
  return listen('command_started', (event) => callback(event.payload));
}

/**
 * Listen for error suggestion
 */
export function onErrorSuggestion(callback) {
  return listen('error_suggestion', (event) => callback(event.payload));
}

/**
 * Listen for workflow step start
 */
export function onWorkflowStepStart(callback) {
  return listen('workflow_step_start', (event) => callback(event.payload));
}

/**
 * Listen for workflow step complete
 */
export function onWorkflowStepComplete(callback) {
  return listen('workflow_step_complete', (event) => callback(event.payload));
}

/**
 * Listen for workflow failed
 */
export function onWorkflowFailed(callback) {
  return listen('workflow_failed', (event) => callback(event.payload));
}

/**
 * Listen for workflow complete
 */
export function onWorkflowComplete(callback) {
  return listen('workflow_complete', (event) => callback(event.payload));
}

export default {
  nlToCmd,
  runCommand,
  killCommand,
  getRunningCommands,
  getContext,
  findProjectRoot,
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


