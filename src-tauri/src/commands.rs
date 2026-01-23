use tauri::AppHandle;

use crate::ai;
use crate::context;
use crate::db;
use crate::models::{AiCommandResponse, AiErrorAnalysis, AiExplanation, AiSuggestion, CommandHandle, CommandHistory, Context, DangerWarning, Preference, SessionSummary, Workflow, WorkflowRunResult, WorkflowStep};
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
    save_history: Option<bool>,
    session_id: Option<String>,
) -> Result<CommandHandle, String> {
    let force_flag = force.unwrap_or(false);
    
    // Check for dangerous commands - return warning for ALL severities when force is false
    if !force_flag {
        if let Some(warning) = redaction::validate_command(&command) {
            // Return structured error that frontend can parse
            // Format: "SECURITY_WARNING:reason:severity:command"
            return Err(format!(
                "SECURITY_WARNING:{}:{}:{}",
                warning.reason,
                warning.severity,
                warning.command
            ));
        }
    }

    // Check for interactive commands
    if redaction::is_interactive_command(&command) {
        return Err(
            "Interactive commands are not supported in this terminal. Use a proper terminal emulator.".to_string()
        );
    }

    // Debug logging to verify IPC parameter receipt
    tracing::info!("[IPC Debug] Received run_command with session_id: {:?}", session_id);
    println!("[IPC Debug] Received run_command with session_id: {:?}", session_id);
    
    runner::run_command_emit(app, command, cwd, generated_by_ai.unwrap_or(false), save_history, session_id).await
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

/// Clear API key for current provider (to show setup screen again)
#[tauri::command]
pub fn clear_api_key() -> Result<(), String> {
    ai::clear_api_key()
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

/// Get all sessions
#[tauri::command]
pub fn get_sessions() -> Result<Vec<SessionSummary>, String> {
    db::get_sessions().map_err(|e| e.to_string())
}

/// Get all commands for a specific session
#[tauri::command]
pub fn get_session_content(session_id: String) -> Result<Vec<CommandHistory>, String> {
    db::get_session_content(&session_id).map_err(|e| e.to_string())
}

// ============ Debug Commands ============

/// Debug: Get total command count
#[tauri::command]
pub fn debug_get_command_count() -> Result<i64, String> {
    db::debug_get_command_count().map_err(|e| e.to_string())
}

/// Debug: Get session count
#[tauri::command]
pub fn debug_get_session_count() -> Result<i64, String> {
    db::debug_get_session_count().map_err(|e| e.to_string())
}

/// Debug: Get recent commands with their session_ids
#[tauri::command]
pub fn debug_get_recent_commands(limit: i32) -> Result<Vec<(Option<i64>, Option<String>, String)>, String> {
    db::debug_get_recent_commands(limit).map_err(|e| e.to_string())
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

// ============ Authentication ============

/// Register a new user
#[tauri::command]
pub fn register(email: String, password: String) -> Result<i64, String> {
    if email.is_empty() || password.is_empty() {
        return Err("Email and password are required".to_string());
    }
    
    // Basic email validation
    if !email.contains('@') || !email.contains('.') {
        return Err("Invalid email format".to_string());
    }
    
    // Password length check
    if password.len() < 6 {
        return Err("Password must be at least 6 characters".to_string());
    }
    
    db::register_user(&email, &password).map_err(|e| e.to_string())
}

/// Login a user
#[tauri::command]
pub fn login(email: String, password: String) -> Result<i64, String> {
    if email.is_empty() || password.is_empty() {
        return Err("Email and password are required".to_string());
    }
    
    db::login_user(&email, &password).map_err(|e| e.to_string())
}

/// Check if user is authenticated (for backend history saving)
#[tauri::command]
pub fn is_authenticated() -> bool {
    // This is a simple check - in a real app, you'd verify a session token
    // For now, we'll rely on frontend localStorage check
    // Backend can't directly check localStorage, so we'll make history saving optional
    true // Always return true, but we'll check on frontend before calling history functions
}

// ============ Path Utilities ============

/// Get the system home directory
#[tauri::command]
pub fn get_home_directory() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, use USERPROFILE environment variable
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOMEDRIVE").and_then(|drive| {
                std::env::var("HOMEPATH").map(|path| format!("{}{}", drive, path))
            }))
            .map_err(|e| format!("Failed to get home directory: {}", e))
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // On Unix-like systems, use HOME environment variable
        std::env::var("HOME")
            .map_err(|e| format!("Failed to get home directory: {}", e))
    }
}

/// Resolve a path relative to the current directory, canonicalizing it
/// Returns the absolute path if it exists, or an error if it doesn't
#[tauri::command]
pub fn resolve_path(current: String, target: String) -> Result<String, String> {
    use std::path::{Path, PathBuf};
    
    // Start with the current directory
    let current_path = if current.is_empty() || current == "." {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
    } else {
        PathBuf::from(&current)
            .canonicalize()
            .map_err(|_| format!("Current directory does not exist: {}", current))?
    };
    
    // Handle special cases
    let target = target.trim();
    
    // Empty target or "." means current directory
    if target.is_empty() || target == "." {
        return Ok(current_path.to_string_lossy().to_string());
    }
    
    // "~" means home directory
    if target == "~" {
        return get_home_directory();
    }
    
    // "~/" means home directory with optional subpath
    let target_path = if target.starts_with("~/") {
        let home = get_home_directory()?;
        PathBuf::from(home).join(&target[2..])
    } else if target == ".." {
        // Parent directory
        current_path.parent()
            .ok_or_else(|| "Cannot go above root directory".to_string())?
            .to_path_buf()
    } else if target.starts_with("..") {
        // Relative path with ".."
        let mut result = current_path.clone();
        let parts: Vec<&str> = target.split('/').collect();
        
        for part in parts {
            if part == ".." {
                result = result.parent()
                    .ok_or_else(|| "Cannot go above root directory".to_string())?
                    .to_path_buf();
            } else if !part.is_empty() && part != "." {
                result.push(part);
            }
        }
        result
    } else if Path::new(&target).is_absolute() {
        // Absolute path
        PathBuf::from(target)
    } else {
        // Relative path
        current_path.join(target)
    };
    
    // Canonicalize the final path and check if it exists
    let resolved = target_path.canonicalize()
        .map_err(|e| format!("Path does not exist: {}", e))?;
    
    // Verify it's a directory
    if !resolved.is_dir() {
        return Err(format!("Path is not a directory: {}", resolved.to_string_lossy()));
    }
    
    Ok(resolved.to_string_lossy().to_string())
}


