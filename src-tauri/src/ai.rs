use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::context::{build_context_string, scan_context};
use crate::db;
use crate::models::{AiCommandResponse, AiErrorAnalysis, AiExplanation, AiSuggestion};
use crate::redaction::redact_sensitive;

const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Debug, Clone)]
enum AiProvider {
    OpenAI,
    Gemini,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ChatMessage,
}

// Gemini API structures
#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    generation_config: GeminiGenerationConfig,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
    #[serde(default)]
    role: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize)]
struct GeminiGenerationConfig {
    temperature: f32,
    max_output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

/// Get the AI provider to use
fn get_provider() -> AiProvider {
    db::get_preference("ai_provider")
        .ok()
        .flatten()
        .and_then(|p| match p.as_str() {
            "gemini" => Some(AiProvider::Gemini),
            "openai" => Some(AiProvider::OpenAI),
            _ => None,
        })
        .unwrap_or(AiProvider::Gemini) // Default to Gemini (free tier)
}

/// Get the API key for the current provider
fn get_api_key(provider: &AiProvider) -> Result<String, String> {
    match provider {
        AiProvider::Gemini => {
            // Try database first
            if let Ok(Some(key)) = db::get_preference("gemini_api_key") {
                return Ok(key);
            }
            // Then environment
            std::env::var("GEMINI_API_KEY").map_err(|_| {
                "Gemini API key not configured. Get a free key at https://makersuite.google.com/app/apikey".to_string()
            })
        }
        AiProvider::OpenAI => {
            if let Ok(Some(key)) = db::get_preference("openai_api_key") {
                return Ok(key);
            }
            std::env::var("OPENAI_API_KEY").map_err(|_| {
                "OpenAI API key not configured. Set it in preferences or OPENAI_API_KEY environment variable.".to_string()
            })
        }
    }
}

/// Get the model to use for the provider
fn get_model(provider: &AiProvider) -> String {
    match provider {
        AiProvider::Gemini => {
            db::get_preference("gemini_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "gemini-1.5-flash-latest".to_string())
        }
        AiProvider::OpenAI => {
            db::get_preference("openai_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "gpt-4o-mini".to_string())
        }
    }
}

/// Call AI API (supports both OpenAI and Gemini)
async fn call_ai(system_prompt: &str, user_prompt: &str) -> Result<String, String> {
    let provider = get_provider();
    let api_key = get_api_key(&provider)?;
    let model = get_model(&provider);

    let client = Client::new();

    match provider {
        AiProvider::OpenAI => {
            let request = ChatRequest {
                model,
                messages: vec![
                    ChatMessage {
                        role: "system".to_string(),
                        content: system_prompt.to_string(),
                    },
                    ChatMessage {
                        role: "user".to_string(),
                        content: user_prompt.to_string(),
                    },
                ],
                temperature: 0.3,
                max_tokens: 1024,
            };

            let response = client
                .post(OPENAI_API_URL)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("Failed to call OpenAI API: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(format!("OpenAI API error ({}): {}", status, text));
            }

            let chat_response: ChatResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

            chat_response
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| "Empty response from OpenAI".to_string())
        }
        AiProvider::Gemini => {
            // Combine system and user prompt for Gemini
            let full_prompt = format!("{}\n\n{}", system_prompt, user_prompt);
            
            let request = GeminiRequest {
                contents: vec![GeminiContent {
                    parts: vec![GeminiPart {
                        text: full_prompt,
                    }],
                    role: "user".to_string(),
                }],
                generation_config: GeminiGenerationConfig {
                    temperature: 0.3,
                    max_output_tokens: 1024,
                },
            };

            let url = format!("{}/{}:generateContent?key={}", GEMINI_API_URL, model, api_key);

            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("Failed to call Gemini API: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(format!("Gemini API error ({}): {}", status, text));
            }

            let gemini_response: GeminiResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

            gemini_response
                .candidates
                .first()
                .and_then(|c| c.content.parts.first())
                .map(|p| p.text.clone())
                .ok_or_else(|| "Empty response from Gemini".to_string())
        }
    }
}

/// Convert natural language to shell command(s)
pub async fn nl_to_cmd(text: &str, cwd: Option<&str>) -> Result<AiCommandResponse, String> {
    // Redact sensitive info before sending
    let redacted_text = redact_sensitive(text);

    // Get context
    let context = cwd.map(scan_context).unwrap_or_default();
    let context_str = build_context_string(&context);

    let system_prompt = format!(
        r#"You are an expert system-shell assistant. Convert the user's natural language instruction into safe shell command(s).

Context: {}

Rules:
1. Output ONLY valid JSON in this exact format: {{"commands": ["cmd1", "cmd2"], "warning": null, "explanation": "brief explanation"}}
2. If the command might be dangerous (rm -rf, format, etc.), set warning to a description
3. Use the context to determine the right package manager (npm/yarn/pnpm, pip/pip3, cargo, etc.)
4. For multi-step operations, provide commands in order
5. Never include secrets or sensitive data in commands
6. Prefer modern, cross-platform commands when possible"#,
        context_str
    );

    let response = call_ai(&system_prompt, &redacted_text).await?;

    // Parse JSON response
    let cleaned = response.trim();
    let json_str = if cleaned.starts_with("```") {
        // Strip markdown code blocks if present
        cleaned
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        cleaned
    };

    serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse AI response: {}. Response was: {}", e, response))
}

/// Analyze an error and suggest fixes
pub async fn analyze_error(
    stderr: &str,
    exit_code: i32,
    command: &str,
    cwd: Option<&str>,
) -> Result<AiErrorAnalysis, String> {
    // Redact sensitive info
    let redacted_stderr = redact_sensitive(stderr);
    let redacted_command = redact_sensitive(command);

    // Get context
    let context = cwd.map(scan_context).unwrap_or_default();
    let context_str = build_context_string(&context);

    let system_prompt = r#"You are an experienced developer helping debug errors.

Rules:
1. Output ONLY valid JSON: {"explanation": "...", "fixes": ["cmd1", "cmd2"], "confidence": 0.9}
2. Explanation should be beginner-friendly
3. Fixes should be concrete shell commands that solve the problem
4. Order fixes by likelihood of success
5. Confidence is 0.0-1.0 based on how certain you are about the fix"#;

    let user_prompt = format!(
        "Command that failed: {}\nExit code: {}\nError output:\n{}\n\nContext: {}",
        redacted_command, exit_code, redacted_stderr, context_str
    );

    let response = call_ai(system_prompt, &user_prompt).await?;

    // Parse JSON response
    let cleaned = response.trim();
    let json_str = if cleaned.starts_with("```") {
        cleaned
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        cleaned
    };

    let analysis: AiErrorAnalysis = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    // Save suggestion to database
    let suggestion = AiSuggestion {
        id: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        prompt: user_prompt,
        response: response.clone(),
        suggestion_type: "error_fix".to_string(),
        command_history_id: None,
    };
    let _ = db::insert_ai_suggestion(&suggestion);

    Ok(analysis)
}

/// Explain a command in detail
pub async fn explain_command(command: &str, cwd: Option<&str>) -> Result<AiExplanation, String> {
    let context = cwd.map(scan_context).unwrap_or_default();
    let context_str = build_context_string(&context);

    let system_prompt = r#"You are a patient teacher explaining shell commands to beginners.

Rules:
1. Output ONLY valid JSON: {"summary": "...", "parts": [{"token": "-x", "explain": "extract files"}, ...]}
2. Break down every flag, option, and argument
3. Use simple, clear language
4. Mention any common gotchas or tips"#;

    let user_prompt = format!(
        "Explain this command: {}\n\nContext: {}",
        command, context_str
    );

    let response = call_ai(system_prompt, &user_prompt).await?;

    // Parse JSON response
    let cleaned = response.trim();
    let json_str = if cleaned.starts_with("```") {
        cleaned
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        cleaned
    };

    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse AI response: {}", e))
}

/// Generate a workflow from natural language description
pub async fn generate_workflow(
    description: &str,
    cwd: Option<&str>,
) -> Result<Vec<serde_json::Value>, String> {
    let context = cwd.map(scan_context).unwrap_or_default();
    let context_str = build_context_string(&context);

    let system_prompt = r#"You are a DevOps expert creating automation workflows.

Rules:
1. Output ONLY a valid JSON array of workflow steps
2. Format: [{"step": 1, "cmd": "...", "cwd": ".", "continue_on_fail": false}, ...]
3. Keep workflows simple (2-5 steps)
4. Each step should be a complete, runnable command
5. Use context to determine appropriate commands"#;

    let user_prompt = format!(
        "Create a workflow for: {}\n\nContext: {}",
        description, context_str
    );

    let response = call_ai(system_prompt, &user_prompt).await?;

    let cleaned = response.trim();
    let json_str = if cleaned.starts_with("```") {
        cleaned
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        cleaned
    };

    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse workflow: {}", e))
}

/// Set the API key for current provider
pub fn set_api_key(key: &str) -> Result<(), String> {
    let provider = get_provider();
    match provider {
        AiProvider::Gemini => db::set_preference("gemini_api_key", key).map_err(|e| e.to_string()),
        AiProvider::OpenAI => db::set_preference("openai_api_key", key).map_err(|e| e.to_string()),
    }
}

/// Set Gemini API key
pub fn set_gemini_api_key(key: &str) -> Result<(), String> {
    db::set_preference("gemini_api_key", key).map_err(|e| e.to_string())
}

/// Set OpenAI API key
pub fn set_openai_api_key(key: &str) -> Result<(), String> {
    db::set_preference("openai_api_key", key).map_err(|e| e.to_string())
}

/// Set the AI provider (gemini or openai)
pub fn set_provider(provider: &str) -> Result<(), String> {
    match provider {
        "gemini" | "openai" => db::set_preference("ai_provider", provider).map_err(|e| e.to_string()),
        _ => Err("Provider must be 'gemini' or 'openai'".to_string()),
    }
}

/// Set the model to use for current provider
pub fn set_model(model: &str) -> Result<(), String> {
    let provider = get_provider();
    match provider {
        AiProvider::Gemini => db::set_preference("gemini_model", model).map_err(|e| e.to_string()),
        AiProvider::OpenAI => db::set_preference("openai_model", model).map_err(|e| e.to_string()),
    }
}

/// Check if AI is configured
pub fn is_configured() -> bool {
    let provider = get_provider();
    get_api_key(&provider).is_ok()
}


