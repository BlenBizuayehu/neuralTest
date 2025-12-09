use tauri::AppHandle;

use crate::ai;
use crate::context;
use crate::db;
use crate::models::*;
use crate::redaction;
use crate::runner;
use crate::workflow;

/// Application state
pub struct AppState {
    pub initialized: bool,
}

// ============ Natural Language Commands ============

/// Convert natural language to shell command(s)
#[tauri::command]
pub async fn nl_to_cmd(
    text: String,
    cwd: Option<String>,
) -> Result<AiCommandResponse, String> {
    // Check for dangerous patterns in user input
    if let Some(warning) = redaction::validate_command(&text) {
        return Ok(AiCommandResponse {
            commands: vec![],
            warning: Some(warning.reason),
            explanation: Some("The request contains potentially dangerous patterns.".to_string()),
        });
    }

    ai::nl_to_cmd(&text, cwd.as_deref()).await
}

// ============ Command Execution ============

/// Run a shell command and stream output
#[tauri::command]
pub async fn run_command(
    app: AppHandle,
    command: String,
    cwd: Option<String>,
    generated_by_ai: Option<bool>,
    force: Option<bool>,
) -> Result<CommandHandle, String> {
    // Check for dangerous commands
    if let Some(warning) = redaction::validate_command(&command) {
        if warning.severity == "high" && !force.unwrap_or(false) {
            return Err(format!(
                "Dangerous command blocked: {}. Use force=true to override.",
                warning.reason
            ));
        }
    }

    // Check for interactive commands
    if redaction::is_interactive_command(&command) {
        return Err(
            "Interactive commands are not supported in this terminal. Use a proper terminal emulator.".to_string()
        );
    }

    runner::run_command_emit(app, command, cwd, generated_by_ai.unwrap_or(false)).await
}

/// Kill a running command
#[tauri::command]
pub fn kill_command(id: i64) -> Result<(), String> {
    runner::kill_command(id)
}

/// Get list of running commands
#[tauri::command]
pub fn get_running_commands() -> Vec<i64> {
    runner::get_running_commands()
}

// ============ Context ============

/// Get project context for current directory
#[tauri::command]
pub fn get_context(cwd: Option<String>) -> Result<Context, String> {
    let dir = cwd.unwrap_or_else(|| ".".to_string());
    Ok(context::scan_context(&dir))
}

/// Find the project root directory
#[tauri::command]
pub fn find_project_root(start: Option<String>) -> Option<String> {
    let dir = start.unwrap_or_else(|| ".".to_string());
    context::find_project_root(&dir)
}

// ============ AI Features ============

/// Analyze an error and get fix suggestions
#[tauri::command]
pub async fn analyze_error(
    stderr: String,
    exit_code: i32,
    command: String,
    cwd: Option<String>,
) -> Result<AiErrorAnalysis, String> {
    ai::analyze_error(&stderr, exit_code, &command, cwd.as_deref()).await
}

/// Explain a command in detail
#[tauri::command]
pub async fn explain_command(
    command: String,
    cwd: Option<String>,
) -> Result<AiExplanation, String> {
    ai::explain_command(&command, cwd.as_deref()).await
}

/// Check if AI is configured
#[tauri::command]
pub fn is_ai_configured() -> bool {
    ai::is_configured()
}

/// Set API key for current provider
#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    ai::set_api_key(&key)
}

/// Set Gemini API key
#[tauri::command]
pub fn set_gemini_api_key(key: String) -> Result<(), String> {
    ai::set_gemini_api_key(&key)
}

/// Set OpenAI API key
#[tauri::command]
pub fn set_openai_api_key(key: String) -> Result<(), String> {
    ai::set_openai_api_key(&key)
}

/// Set AI provider (gemini or openai)
#[tauri::command]
pub fn set_ai_provider(provider: String) -> Result<(), String> {
    ai::set_provider(&provider)
}

/// Set the AI model to use
#[tauri::command]
pub fn set_ai_model(model: String) -> Result<(), String> {
    ai::set_model(&model)
}

// ============ Workflows ============

/// Run a workflow
#[tauri::command]
pub async fn run_workflow(
    app: AppHandle,
    definition: serde_json::Value,
    cwd: Option<String>,
    workflow_id: Option<i64>,
) -> Result<WorkflowRunResult, String> {
    let steps = workflow::parse_workflow_steps(definition)?;
    workflow::run_workflow(app, workflow_id, steps, cwd).await
}

/// Create a new workflow
#[tauri::command]
pub fn create_workflow(
    name: String,
    description: Option<String>,
    steps: Vec<WorkflowStep>,
) -> Result<i64, String> {
    workflow::create_workflow(&name, description.as_deref(), steps)
}

/// Get all saved workflows
#[tauri::command]
pub fn get_workflows() -> Result<Vec<Workflow>, String> {
    workflow::get_workflows()
}

/// Generate a workflow from natural language
#[tauri::command]
pub async fn generate_workflow(
    description: String,
    cwd: Option<String>,
) -> Result<Vec<WorkflowStep>, String> {
    workflow::generate_workflow_from_nl(&description, cwd.as_deref()).await
}

// ============ History & Preferences ============

/// Get command history
#[tauri::command]
pub fn get_history(limit: Option<i32>, offset: Option<i32>) -> Result<Vec<CommandHistory>, String> {
    db::get_command_history(limit, offset).map_err(|e| e.to_string())
}

/// Get AI suggestions for a command
#[tauri::command]
pub fn get_suggestions_for_command(command_id: i64) -> Result<Vec<AiSuggestion>, String> {
    db::get_ai_suggestions_for_command(command_id).map_err(|e| e.to_string())
}

/// Get a preference value
#[tauri::command]
pub fn get_preference(key: String) -> Result<Option<String>, String> {
    db::get_preference(&key).map_err(|e| e.to_string())
}

/// Set a preference value
#[tauri::command]
pub fn set_preference(key: String, value: String) -> Result<(), String> {
    db::set_preference(&key, &value).map_err(|e| e.to_string())
}

/// Get all preferences
#[tauri::command]
pub fn get_all_preferences() -> Result<Vec<Preference>, String> {
    db::get_all_preferences().map_err(|e| e.to_string())
}

// ============ Security ============

/// Validate a command for safety
#[tauri::command]
pub fn validate_command(command: String) -> Option<DangerWarning> {
    redaction::validate_command(&command)
}

/// Check if a command is interactive
#[tauri::command]
pub fn is_interactive_command(command: String) -> bool {
    redaction::is_interactive_command(&command)
}

/// Redact sensitive information from text
#[tauri::command]
pub fn redact_sensitive(text: String) -> String {
    redaction::redact_sensitive(&text)
}


