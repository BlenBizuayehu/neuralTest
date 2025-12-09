use chrono::Utc;
use tauri::{AppHandle, Emitter};

use crate::ai;
use crate::db;
use crate::models::{Workflow, WorkflowRunResult, WorkflowStep};
use crate::runner;

/// Run a workflow with the given steps
pub async fn run_workflow(
    app: AppHandle,
    workflow_id: Option<i64>,
    steps: Vec<WorkflowStep>,
    cwd: Option<String>,
) -> Result<WorkflowRunResult, String> {
    let working_dir = cwd.unwrap_or_else(|| ".".to_string());
    let wf_id = workflow_id.unwrap_or(0);

    let mut steps_completed = 0;
    let mut failed_step = None;
    let mut error_msg = None;
    let mut suggestion = None;

    for step in &steps {
        // Emit step start event
        let _ = app.emit(
            "workflow_step_start",
            serde_json::json!({
                "workflow_id": wf_id,
                "step": step.step,
                "cmd": step.cmd
            }),
        );

        // Determine the working directory for this step
        let step_cwd = step.cwd.clone().unwrap_or_else(|| working_dir.clone());

        // Run the command synchronously
        let result = runner::run_command_sync(&step.cmd, Some(&step_cwd)).await;

        match result {
            Ok((exit_code, stdout, stderr)) => {
                // Emit step complete event
                let _ = app.emit(
                    "workflow_step_complete",
                    serde_json::json!({
                        "workflow_id": wf_id,
                        "step": step.step,
                        "exit_code": exit_code,
                        "stdout": stdout,
                        "stderr": stderr
                    }),
                );

                if exit_code != 0 && !step.continue_on_fail {
                    // Step failed
                    failed_step = Some(step.step);
                    error_msg = Some(stderr.clone());

                    // Try to get AI suggestion for the error
                    if let Ok(analysis) =
                        ai::analyze_error(&stderr, exit_code, &step.cmd, Some(&step_cwd)).await
                    {
                        suggestion = Some(analysis.clone());

                        let _ = app.emit(
                            "workflow_failed",
                            serde_json::json!({
                                "workflow_id": wf_id,
                                "step": step.step,
                                "error": stderr,
                                "suggestion": analysis
                            }),
                        );
                    } else {
                        let _ = app.emit(
                            "workflow_failed",
                            serde_json::json!({
                                "workflow_id": wf_id,
                                "step": step.step,
                                "error": stderr
                            }),
                        );
                    }

                    break;
                }

                steps_completed = step.step;
            }
            Err(e) => {
                failed_step = Some(step.step);
                error_msg = Some(e.clone());

                let _ = app.emit(
                    "workflow_failed",
                    serde_json::json!({
                        "workflow_id": wf_id,
                        "step": step.step,
                        "error": e
                    }),
                );

                break;
            }
        }
    }

    // Update workflow last run time if we have a workflow ID
    if let Some(id) = workflow_id {
        let _ = db::update_workflow_last_run(id, &Utc::now().to_rfc3339());
    }

    let success = failed_step.is_none();

    // Emit workflow complete event
    let _ = app.emit(
        "workflow_complete",
        serde_json::json!({
            "workflow_id": wf_id,
            "success": success,
            "steps_completed": steps_completed
        }),
    );

    Ok(WorkflowRunResult {
        workflow_id: wf_id,
        success,
        steps_completed,
        failed_step,
        error: error_msg,
        suggestion,
    })
}

/// Create and save a new workflow
pub fn create_workflow(
    name: &str,
    description: Option<&str>,
    steps: Vec<WorkflowStep>,
) -> Result<i64, String> {
    let workflow = Workflow {
        id: None,
        name: name.to_string(),
        description: description.map(|s| s.to_string()),
        definition: serde_json::to_value(&steps).map_err(|e| e.to_string())?,
        created_at: Some(Utc::now().to_rfc3339()),
        last_run_at: None,
    };

    db::insert_workflow(&workflow).map_err(|e| e.to_string())
}

/// Get all saved workflows
pub fn get_workflows() -> Result<Vec<Workflow>, String> {
    db::get_workflows().map_err(|e| e.to_string())
}

/// Parse workflow steps from JSON value
pub fn parse_workflow_steps(definition: serde_json::Value) -> Result<Vec<WorkflowStep>, String> {
    serde_json::from_value(definition).map_err(|e| format!("Invalid workflow definition: {}", e))
}

/// Generate a workflow from natural language
pub async fn generate_workflow_from_nl(
    description: &str,
    cwd: Option<&str>,
) -> Result<Vec<WorkflowStep>, String> {
    let steps_json = ai::generate_workflow(description, cwd).await?;

    let steps: Vec<WorkflowStep> = steps_json
        .into_iter()
        .map(|v| serde_json::from_value(v))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to parse workflow steps: {}", e))?;

    Ok(steps)
}


