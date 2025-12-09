import { useState, useEffect } from 'react';
import './WorkflowRunner.css';
import {
  runWorkflow,
  getWorkflows,
  onWorkflowStepStart,
  onWorkflowStepComplete,
  onWorkflowFailed,
  onWorkflowComplete,
} from '../../services/tauriClient';

/**
 * WorkflowRunner - Component for running multi-step workflows
 */
export default function WorkflowRunner({ isOpen, onClose, cwd }) {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [stepStatuses, setStepStatuses] = useState({});
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadWorkflows();
      setupListeners();
    }
  }, [isOpen]);

  const loadWorkflows = async () => {
    try {
      const wfs = await getWorkflows();
      setWorkflows(wfs);
    } catch (e) {
      console.error('Failed to load workflows:', e);
    }
  };

  const setupListeners = async () => {
    const unlisteners = [];

    unlisteners.push(
      await onWorkflowStepStart(({ workflow_id, step, cmd }) => {
        setStepStatuses((prev) => ({
          ...prev,
          [step]: { status: 'running', cmd },
        }));
      })
    );

    unlisteners.push(
      await onWorkflowStepComplete(({ workflow_id, step, exit_code, stdout, stderr }) => {
        setStepStatuses((prev) => ({
          ...prev,
          [step]: {
            status: exit_code === 0 ? 'success' : 'error',
            exitCode: exit_code,
            stdout,
            stderr,
          },
        }));
      })
    );

    unlisteners.push(
      await onWorkflowFailed(({ workflow_id, step, error, suggestion }) => {
        setStepStatuses((prev) => ({
          ...prev,
          [step]: {
            ...prev[step],
            status: 'failed',
            error,
            suggestion,
          },
        }));
        setIsRunning(false);
      })
    );

    unlisteners.push(
      await onWorkflowComplete(({ workflow_id, success, steps_completed }) => {
        setCurrentRun((prev) => ({
          ...prev,
          completed: true,
          success,
          stepsCompleted: steps_completed,
        }));
        setIsRunning(false);
      })
    );

    return () => unlisteners.forEach((u) => u?.());
  };

  const handleRunWorkflow = async (workflow) => {
    setSelectedWorkflow(workflow);
    setStepStatuses({});
    setIsRunning(true);
    setCurrentRun({
      workflowId: workflow.id,
      completed: false,
      success: false,
      stepsCompleted: 0,
    });

    try {
      await runWorkflow(workflow.definition, cwd, workflow.id);
    } catch (e) {
      console.error('Failed to run workflow:', e);
      setIsRunning(false);
    }
  };

  const getStepIcon = (status) => {
    switch (status) {
      case 'running':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
      case 'failed':
        return '❌';
      default:
        return '⬜';
    }
  };

  if (!isOpen) return null;

  const steps = selectedWorkflow
    ? (Array.isArray(selectedWorkflow.definition)
        ? selectedWorkflow.definition
        : JSON.parse(selectedWorkflow.definition))
    : [];

  return (
    <div className="workflow-runner-overlay" onClick={onClose}>
      <div className="workflow-runner" onClick={(e) => e.stopPropagation()}>
        <div className="workflow-header">
          <div className="header-title">
            <span className="header-icon">⚡</span>
            <h3>Workflow Runner</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="workflow-content">
          {!selectedWorkflow ? (
            <>
              <h4>Saved Workflows</h4>
              {workflows.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📋</span>
                  <p>No workflows saved yet</p>
                  <p className="hint">Use the AI panel to generate workflows</p>
                </div>
              ) : (
                <div className="workflows-list">
                  {workflows.map((wf) => (
                    <div key={wf.id} className="workflow-item">
                      <div className="workflow-info">
                        <span className="workflow-name">{wf.name}</span>
                        {wf.description && (
                          <span className="workflow-desc">{wf.description}</span>
                        )}
                      </div>
                      <button
                        className="run-btn"
                        onClick={() => handleRunWorkflow(wf)}
                      >
                        Run
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="workflow-details">
                <button
                  className="back-btn"
                  onClick={() => {
                    setSelectedWorkflow(null);
                    setStepStatuses({});
                    setCurrentRun(null);
                  }}
                  disabled={isRunning}
                >
                  ← Back
                </button>
                <h4>{selectedWorkflow.name}</h4>
              </div>

              <div className="steps-list">
                {steps.map((step, index) => {
                  const status = stepStatuses[step.step] || {};
                  return (
                    <div
                      key={index}
                      className={`step-item ${status.status || 'pending'}`}
                    >
                      <div className="step-header">
                        <span className="step-icon">
                          {getStepIcon(status.status)}
                        </span>
                        <span className="step-number">Step {step.step}</span>
                        <code className="step-cmd">{step.cmd}</code>
                      </div>

                      {status.status === 'running' && (
                        <div className="step-running">
                          <span className="spinner"></span>
                          Running...
                        </div>
                      )}

                      {status.stdout && (
                        <pre className="step-output stdout">{status.stdout}</pre>
                      )}

                      {status.stderr && (
                        <pre className="step-output stderr">{status.stderr}</pre>
                      )}

                      {status.suggestion && (
                        <div className="step-suggestion">
                          <span className="suggestion-icon">💡</span>
                          <div className="suggestion-content">
                            <p>{status.suggestion.explanation}</p>
                            {status.suggestion.fixes?.map((fix, i) => (
                              <code key={i} className="fix-cmd">{fix}</code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {currentRun?.completed && (
                <div className={`run-result ${currentRun.success ? 'success' : 'error'}`}>
                  {currentRun.success ? (
                    <>
                      <span className="result-icon">🎉</span>
                      <span>Workflow completed successfully!</span>
                    </>
                  ) : (
                    <>
                      <span className="result-icon">⚠️</span>
                      <span>Workflow failed at step {currentRun.stepsCompleted + 1}</span>
                    </>
                  )}
                </div>
              )}

              {!isRunning && !currentRun?.completed && (
                <button
                  className="run-workflow-btn"
                  onClick={() => handleRunWorkflow(selectedWorkflow)}
                >
                  ▶ Run Workflow
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


