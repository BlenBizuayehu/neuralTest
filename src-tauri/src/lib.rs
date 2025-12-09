mod ai;
mod commands;
mod context;
mod db;
mod models;
mod redaction;
mod runner;
mod workflow;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing for logging
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // Initialize database
            db::init_db().expect("Failed to initialize database");
            tracing::info!("Project Neural initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Natural Language
            nl_to_cmd,
            // Command Execution
            run_command,
            kill_command,
            get_running_commands,
            // Context
            get_context,
            find_project_root,
            // AI Features
            analyze_error,
            explain_command,
            is_ai_configured,
            set_api_key,
            set_gemini_api_key,
            set_openai_api_key,
            set_ai_provider,
            set_ai_model,
            clear_api_key,
            // Workflows
            run_workflow,
            create_workflow,
            get_workflows,
            generate_workflow,
            // History & Preferences
            get_history,
            get_suggestions_for_command,
            get_preference,
            set_preference,
            get_all_preferences,
            // Security
            validate_command,
            is_interactive_command,
            redact_sensitive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
