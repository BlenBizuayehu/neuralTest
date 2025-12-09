use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;

use chrono::Utc;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

use crate::db;
use crate::models::{CommandHandle, CommandHistory};
use crate::redaction::is_binary_output;

/// Store for active running processes
static RUNNING_PROCESSES: once_cell::sync::Lazy<Arc<Mutex<HashMap<i64, Child>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Run a command and stream output via events
pub async fn run_command_emit(
    app: AppHandle,
    command: String,
    cwd: Option<String>,
    generated_by_ai: bool,
) -> Result<CommandHandle, String> {
    let timestamp = Utc::now().to_rfc3339();
    let working_dir = cwd.clone().unwrap_or_else(|| ".".to_string());

    // Create initial history entry
    let history = CommandHistory {
        id: None,
        timestamp: timestamp.clone(),
        command_text: command.clone(),
        generated_by_ai,
        cwd: cwd.clone(),
        exit_code: None,
        stdout: None,
        stderr: None,
    };

    let id = db::insert_command_history(&history).map_err(|e| e.to_string())?;

    // Emit start event
    let _ = app.emit(
        "command_started",
        serde_json::json!({
            "id": id,
            "command_text": command,
            "timestamp": timestamp
        }),
    );

    // Debug: Log the exact command being executed
    tracing::info!("Executing command: '{}' in directory: '{}'", command, working_dir);
    println!("[DEBUG] About to execute command: '{}'", command);
    println!("[DEBUG] Working directory: '{}'", working_dir);

    // Determine shell based on OS
    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &command]);
    
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("sh");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["-c", &command]);

    // Spawn the process
    let mut child = cmd
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Store the child process for potential cancellation
    RUNNING_PROCESSES.lock().insert(id, child);

    let app_stdout = app.clone();
    let app_stderr = app.clone();
    let app_exit = app.clone();

    let stdout_buffer = Arc::new(Mutex::new(String::new()));
    let stderr_buffer = Arc::new(Mutex::new(String::new()));
    let stdout_buf_clone = stdout_buffer.clone();
    let stderr_buf_clone = stderr_buffer.clone();

    // Spawn stdout reader task
    if let Some(stdout) = stdout {
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                stdout_buf_clone.lock().push_str(&line);
                stdout_buf_clone.lock().push('\n');

                let _ = app_stdout.emit(
                    "command_stdout",
                    serde_json::json!({
                        "id": id,
                        "chunk": format!("{}\n", line)
                    }),
                );
            }
        });
    }

    // Spawn stderr reader task
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                stderr_buf_clone.lock().push_str(&line);
                stderr_buf_clone.lock().push('\n');

                let _ = app_stderr.emit(
                    "command_stderr",
                    serde_json::json!({
                        "id": id,
                        "chunk": format!("{}\n", line)
                    }),
                );
            }
        });
    }

    // Spawn exit watcher task
    let stdout_final = stdout_buffer.clone();
    let stderr_final = stderr_buffer.clone();

    tokio::spawn(async move {
        // Wait a bit for the process to be stored
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        // Try to wait for the process
        // Remove from map first, then drop the lock before awaiting
        let mut child_opt = {
            let mut processes = RUNNING_PROCESSES.lock();
            processes.remove(&id)
        };

        let exit_code = if let Some(mut child) = child_opt {
            match child.wait().await {
                Ok(status) => status.code().unwrap_or(-1),
                Err(_) => -1,
            }
        } else {
            -1
        };

        // Give time for stdout/stderr to finish
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Update database with results
        let stdout_str = stdout_final.lock().clone();
        let stderr_str = stderr_final.lock().clone();

        let _ = db::update_command_history_output(
            id,
            Some(&stdout_str),
            Some(&stderr_str),
            Some(exit_code),
        );

        // Emit exit event
        let _ = app_exit.emit(
            "command_exit",
            serde_json::json!({
                "id": id,
                "exit_code": exit_code
            }),
        );
    });

    Ok(CommandHandle {
        id,
        command_text: command,
        timestamp,
    })
}

/// Run a command synchronously and return result (for workflows)
pub async fn run_command_sync(
    command: &str,
    cwd: Option<&str>,
) -> Result<(i32, String, String), String> {
    let working_dir = cwd.unwrap_or(".");

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", command]);
    
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("sh");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["-c", command]);

    let output = cmd
        .current_dir(working_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let exit_code = output.status.code().unwrap_or(-1);

    let stdout = if is_binary_output(&output.stdout) {
        "[Binary output]".to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    let stderr = if is_binary_output(&output.stderr) {
        "[Binary output]".to_string()
    } else {
        String::from_utf8_lossy(&output.stderr).to_string()
    };

    Ok((exit_code, stdout, stderr))
}

/// Kill a running command
pub fn kill_command(id: i64) -> Result<(), String> {
    let mut processes = RUNNING_PROCESSES.lock();

    if let Some(mut child) = processes.remove(&id) {
        // Try to kill the process
        match child.start_kill() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to kill process: {}", e)),
        }
    } else {
        Err("Process not found or already completed".to_string())
    }
}

/// Get list of running command IDs
pub fn get_running_commands() -> Vec<i64> {
    RUNNING_PROCESSES.lock().keys().cloned().collect()
}


