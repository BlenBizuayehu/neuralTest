use serde::{Deserialize, Serialize};

/// Command history entry stored in SQLite
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandHistory {
    pub id: Option<i64>,
    pub timestamp: String,
    pub command_text: String,
    pub generated_by_ai: bool,
    pub cwd: Option<String>,
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub session_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<i32>,
}

/// Session summary for history sidebar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub start_time: String,
    pub title: String,
}

/// AI suggestion entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSuggestion {
    pub id: Option<i64>,
    pub created_at: String,
    pub prompt: String,
    pub response: String,
    #[serde(rename = "type")]
    pub suggestion_type: String,
    pub command_history_id: Option<i64>,
}

/// Workflow definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub definition: serde_json::Value,
    pub created_at: Option<String>,
    pub last_run_at: Option<String>,
}

/// Single workflow step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub step: i32,
    pub cmd: String,
    pub cwd: Option<String>,
    #[serde(default)]
    pub continue_on_fail: bool,
}

/// User preference entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preference {
    pub id: Option<i64>,
    pub key: String,
    pub value: String,
}

/// NPM script entry with command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpmScript {
    pub name: String,
    pub command: String,
}

/// Project context information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub project_type: Option<String>,
    pub has_package_json: bool,
    pub has_cargo_toml: bool,
    pub has_requirements_txt: bool,
    pub has_pipfile: bool,
    pub has_pyproject_toml: bool,
    pub has_manage_py: bool,
    pub has_composer_json: bool,
    pub has_pom_xml: bool,
    pub has_build_gradle: bool,
    pub has_build_gradle_kts: bool,
    pub has_go_mod: bool,
    pub has_git: bool,
    pub has_dockerfile: bool,
    pub has_docker_compose: bool,
    pub has_makefile: bool,
    pub npm_scripts: Option<Vec<String>>, // Legacy: just script names
    pub npm_scripts_detailed: Option<Vec<NpmScript>>, // New: names with commands
    pub cargo_binaries: Option<Vec<String>>,
    pub makefile_targets: Option<Vec<String>>,
    pub cwd: String,
}

impl Default for Context {
    fn default() -> Self {
        Self {
            project_type: None,
            has_package_json: false,
            has_cargo_toml: false,
            has_requirements_txt: false,
            has_pipfile: false,
            has_pyproject_toml: false,
            has_manage_py: false,
            has_composer_json: false,
            has_pom_xml: false,
            has_build_gradle: false,
            has_build_gradle_kts: false,
            has_go_mod: false,
            has_git: false,
            has_dockerfile: false,
            has_docker_compose: false,
            has_makefile: false,
            npm_scripts: None,
            npm_scripts_detailed: None,
            cargo_binaries: None,
            makefile_targets: None,
            cwd: String::new(),
        }
    }
}

/// AI response for NL to command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCommandResponse {
    pub commands: Vec<String>,
    pub warning: Option<String>,
    pub explanation: Option<String>,
}

/// AI error analysis response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiErrorAnalysis {
    pub explanation: String,
    #[serde(default)]
    pub fix: Option<String>, // Single fix command (new format)
    #[serde(default)]
    pub fixes: Vec<String>, // Multiple fixes (legacy format)
    #[serde(default)]
    pub confidence: Option<f32>,
}

/// AI command explanation response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiExplanation {
    pub summary: String,
    pub parts: Vec<CommandPart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPart {
    pub token: String,
    pub explain: String,
}

/// Command handle returned when starting a command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandHandle {
    pub id: i64,
    pub command_text: String,
    pub timestamp: String,
}

/// Danger warning for risky commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DangerWarning {
    pub command: String,
    pub reason: String,
    pub severity: String, // "high", "medium", "low"
}

/// Workflow run result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRunResult {
    pub workflow_id: i64,
    pub success: bool,
    pub steps_completed: i32,
    pub failed_step: Option<i32>,
    pub error: Option<String>,
    pub suggestion: Option<AiErrorAnalysis>,
}


