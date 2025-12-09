use anyhow::Result;
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;

use crate::models::{AiSuggestion, CommandHistory, Preference, Workflow};

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

/// Get the database path
fn get_db_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("project-neural");
    std::fs::create_dir_all(&app_dir).ok();
    app_dir.join("neural.db")
}

/// Initialize the database connection and create tables
pub fn init_db() -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    
    // Create tables
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS commands_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            command_text TEXT NOT NULL,
            generated_by_ai INTEGER DEFAULT 0,
            cwd TEXT,
            exit_code INTEGER,
            stdout TEXT,
            stderr TEXT
        );

        CREATE TABLE IF NOT EXISTS ai_suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            prompt TEXT NOT NULL,
            response TEXT NOT NULL,
            type TEXT NOT NULL,
            command_history_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            definition TEXT NOT NULL,
            created_at TEXT,
            last_run_at TEXT
        );

        CREATE TABLE IF NOT EXISTS preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created ON ai_suggestions(created_at);
        "#,
    )?;

    DB.set(Mutex::new(conn))
        .map_err(|_| anyhow::anyhow!("Database already initialized"))?;

    Ok(())
}

/// Get a reference to the database connection
fn get_db() -> &'static Mutex<Connection> {
    DB.get().expect("Database not initialized")
}

// ============ Command History Operations ============

/// Insert a new command history entry (at start of execution)
pub fn insert_command_history(cmd: &CommandHistory) -> Result<i64> {
    let conn = get_db().lock();
    conn.execute(
        "INSERT INTO commands_history (timestamp, command_text, generated_by_ai, cwd) VALUES (?1, ?2, ?3, ?4)",
        (
            &cmd.timestamp,
            &cmd.command_text,
            cmd.generated_by_ai as i32,
            &cmd.cwd,
        ),
    )?;
    Ok(conn.last_insert_rowid())
}

/// Update command history with output and exit code
pub fn update_command_history_output(
    id: i64,
    stdout: Option<&str>,
    stderr: Option<&str>,
    exit_code: Option<i32>,
) -> Result<()> {
    let conn = get_db().lock();
    conn.execute(
        "UPDATE commands_history SET stdout = ?1, stderr = ?2, exit_code = ?3 WHERE id = ?4",
        (stdout, stderr, exit_code, id),
    )?;
    Ok(())
}

/// Get command history with pagination
pub fn get_command_history(limit: Option<i32>, offset: Option<i32>) -> Result<Vec<CommandHistory>> {
    let conn = get_db().lock();
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn.prepare(
        "SELECT id, timestamp, command_text, generated_by_ai, cwd, exit_code, stdout, stderr 
         FROM commands_history ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2",
    )?;

    let rows = stmt.query_map([limit, offset], |row| {
        Ok(CommandHistory {
            id: Some(row.get(0)?),
            timestamp: row.get(1)?,
            command_text: row.get(2)?,
            generated_by_ai: row.get::<_, i32>(3)? != 0,
            cwd: row.get(4)?,
            exit_code: row.get(5)?,
            stdout: row.get(6)?,
            stderr: row.get(7)?,
        })
    })?;

    let mut history = Vec::new();
    for row in rows {
        history.push(row?);
    }
    Ok(history)
}

// ============ AI Suggestions Operations ============

/// Insert a new AI suggestion
pub fn insert_ai_suggestion(suggestion: &AiSuggestion) -> Result<i64> {
    let conn = get_db().lock();
    conn.execute(
        "INSERT INTO ai_suggestions (created_at, prompt, response, type, command_history_id) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &suggestion.created_at,
            &suggestion.prompt,
            &suggestion.response,
            &suggestion.suggestion_type,
            suggestion.command_history_id,
        ),
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get AI suggestions for a command
pub fn get_ai_suggestions_for_command(command_history_id: i64) -> Result<Vec<AiSuggestion>> {
    let conn = get_db().lock();
    let mut stmt = conn.prepare(
        "SELECT id, created_at, prompt, response, type, command_history_id 
         FROM ai_suggestions WHERE command_history_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([command_history_id], |row| {
        Ok(AiSuggestion {
            id: Some(row.get(0)?),
            created_at: row.get(1)?,
            prompt: row.get(2)?,
            response: row.get(3)?,
            suggestion_type: row.get(4)?,
            command_history_id: row.get(5)?,
        })
    })?;

    let mut suggestions = Vec::new();
    for row in rows {
        suggestions.push(row?);
    }
    Ok(suggestions)
}

// ============ Workflows Operations ============

/// Insert a new workflow
pub fn insert_workflow(workflow: &Workflow) -> Result<i64> {
    let conn = get_db().lock();
    conn.execute(
        "INSERT INTO workflows (name, description, definition, created_at) VALUES (?1, ?2, ?3, ?4)",
        (
            &workflow.name,
            &workflow.description,
            workflow.definition.to_string(),
            &workflow.created_at,
        ),
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get all workflows
pub fn get_workflows() -> Result<Vec<Workflow>> {
    let conn = get_db().lock();
    let mut stmt = conn.prepare(
        "SELECT id, name, description, definition, created_at, last_run_at FROM workflows ORDER BY name",
    )?;

    let rows = stmt.query_map([], |row| {
        let def_str: String = row.get(3)?;
        Ok(Workflow {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            description: row.get(2)?,
            definition: serde_json::from_str(&def_str).unwrap_or(serde_json::Value::Null),
            created_at: row.get(4)?,
            last_run_at: row.get(5)?,
        })
    })?;

    let mut workflows = Vec::new();
    for row in rows {
        workflows.push(row?);
    }
    Ok(workflows)
}

/// Update workflow last run time
pub fn update_workflow_last_run(id: i64, last_run_at: &str) -> Result<()> {
    let conn = get_db().lock();
    conn.execute(
        "UPDATE workflows SET last_run_at = ?1 WHERE id = ?2",
        (last_run_at, id),
    )?;
    Ok(())
}

// ============ Preferences Operations ============

/// Get a preference value
pub fn get_preference(key: &str) -> Result<Option<String>> {
    let conn = get_db().lock();
    let mut stmt = conn.prepare("SELECT value FROM preferences WHERE key = ?1")?;
    let result = stmt.query_row([key], |row| row.get(0));
    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Set a preference value
pub fn set_preference(key: &str, value: &str) -> Result<()> {
    let conn = get_db().lock();
    conn.execute(
        "INSERT OR REPLACE INTO preferences (key, value) VALUES (?1, ?2)",
        (key, value),
    )?;
    Ok(())
}

/// Get all preferences
pub fn get_all_preferences() -> Result<Vec<Preference>> {
    let conn = get_db().lock();
    let mut stmt = conn.prepare("SELECT id, key, value FROM preferences")?;

    let rows = stmt.query_map([], |row| {
        Ok(Preference {
            id: Some(row.get(0)?),
            key: row.get(1)?,
            value: row.get(2)?,
        })
    })?;

    let mut prefs = Vec::new();
    for row in rows {
        prefs.push(row?);
    }
    Ok(prefs)
}


