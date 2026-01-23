use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::context::{build_context_string, scan_context};
use crate::db;
use crate::models::{AiCommandResponse, AiErrorAnalysis, AiExplanation, AiSuggestion};
use crate::redaction::redact_sensitive;

/// Detect the operating system and shell
fn detect_os_and_shell() -> (String, String) {
    let os = std::env::consts::OS;
    let shell = match os {
        "windows" => "PowerShell",
        "linux" => "Bash",
        "macos" => "Zsh",
        _ => "Bash", // Default fallback
    };
    (os.to_string(), shell.to_string())
}

/// Extract JSON from text by finding the first `{` and last `}`
/// This handles cases where AI wraps JSON in markdown code blocks or adds conversational text
fn extract_json_from_text(text: &str) -> String {
    // Find the first opening brace
    let start = text.find('{');
    // Find the last closing brace
    let end = text.rfind('}');
    
    match (start, end) {
        (Some(start_idx), Some(end_idx)) if end_idx >= start_idx => {
            // Extract the substring between first { and last } (inclusive)
            text[start_idx..=end_idx].to_string()
        }
        _ => {
            // If no braces found, return the original text (might be a raw string error)
            text.to_string()
        }
    }
}

/// Build OS context header for system prompts
fn build_os_context_header() -> String {
    let (os, shell) = detect_os_and_shell();
    let os_display = match os.as_str() {
        "windows" => "Windows",
        "linux" => "Linux",
        "macos" => "macOS",
        _ => os.as_str(),
    };
    
    format!(
        r#"CRITICAL SYSTEM CONTEXT:
- Operating System: {} ({})
- Active Shell: {}

RULES:
1. You MUST generate commands valid for {}.
2. If on Windows, do NOT use Unix variables like $HOME or forward slashes / for paths. Use %USERPROFILE% or backslashes \ where appropriate for PowerShell.
3. If on Windows, use `Get-ChildItem` or `ls` (alias), but ensure flags are PowerShell compatible (e.g. do not use `ls -la`, use `ls -Force` or `Get-ChildItem -Force`).
4. If on Unix/Linux/macOS, use standard Unix commands and paths with forward slashes.
5. Path separators: Windows uses `\` or `/` (PowerShell accepts both), Unix uses `/`.
6. Environment variables: Windows uses `%VAR%` or `$env:VAR` (PowerShell), Unix uses `$VAR`."#,
        os_display, os, shell, shell
    )
}

const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/chat/completions";

#[derive(Debug, Clone)]
enum AiProvider {
    OpenAI,
    Gemini,
    Groq,
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
            "groq" => Some(AiProvider::Groq),
            _ => None,
        })
        .unwrap_or(AiProvider::Groq) // Default to Groq (fast and free)
}

/// Get the API key for the current provider
fn get_api_key(provider: &AiProvider) -> Result<String, String> {
    match provider {
        AiProvider::Gemini => {
            // Prefer environment variable for easier local configuration
            if let Ok(key) = std::env::var("GEMINI_API_KEY") {
                if !key.is_empty() {
                    return Ok(key);
                }
            }
            // Fall back to stored preference
            if let Ok(Some(key)) = db::get_preference("gemini_api_key") {
                if !key.is_empty() {
                    return Ok(key);
                }
            }

            Err("Gemini API key not configured. Add GEMINI_API_KEY to your .env file (get a free key at https://makersuite.google.com/app/apikey).".to_string())
        }
        AiProvider::OpenAI => {
            if let Ok(key) = std::env::var("OPENAI_API_KEY") {
                if !key.is_empty() {
                    return Ok(key);
                }
            }

            if let Ok(Some(key)) = db::get_preference("openai_api_key") {
                if !key.is_empty() {
                    return Ok(key);
                }
            }

            Err("OpenAI API key not configured. Add OPENAI_API_KEY to your .env file or set it in preferences.".to_string())
        }
        AiProvider::Groq => {
            // Prefer environment variable for easier local configuration
            if let Ok(key) = std::env::var("GROQ_API_KEY") {
                if !key.trim().is_empty() {
                    tracing::debug!("Using GROQ_API_KEY from environment variable");
                    return Ok(key.trim().to_string());
                }
            }
            // Fall back to stored preference
            if let Ok(Some(key)) = db::get_preference("groq_api_key") {
                if !key.trim().is_empty() {
                    tracing::debug!("Using groq_api_key from database (length: {})", key.trim().len());
                    return Ok(key.trim().to_string());
                } else {
                    tracing::warn!("groq_api_key found in database but is empty");
                }
            } else {
                tracing::warn!("groq_api_key not found in database");
            }

            Err("Groq API key not configured. Add GROQ_API_KEY to your .env file or get a free key at https://console.groq.com/keys.".to_string())
        }
    }
}

/// Get the model to use for the provider
fn get_model(provider: &AiProvider) -> String {
    match provider {
        AiProvider::Gemini => {
            let model = db::get_preference("gemini_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "gemini-2.5-flash".to_string());
            
            // Migrate gemini-1.5-flash to gemini-2.5-flash (v1beta API requirement)
            if model == "gemini-1.5-flash" {
                let _ = db::set_preference("gemini_model", "gemini-2.5-flash");
                "gemini-2.5-flash".to_string()
            } else {
                model
            }
        }
        AiProvider::OpenAI => {
            db::get_preference("openai_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "gpt-4o-mini".to_string())
        }
        AiProvider::Groq => {
            db::get_preference("groq_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "openai/gpt-oss-120b".to_string())
        }
    }
}

/// Call AI API (supports both OpenAI and Gemini)
async fn call_ai(system_prompt: &str, user_prompt: &str) -> Result<String, String> {
    let provider = get_provider();
    let api_key = get_api_key(&provider)?;
    let model = get_model(&provider);
    
    // Debug logging: Print provider and key length (not the key itself)
    let provider_name = match provider {
        AiProvider::Gemini => "Gemini",
        AiProvider::OpenAI => "OpenAI",
        AiProvider::Groq => "Groq",
    };
    println!("[AI Debug] Attempting to call AI with Provider: {} and Key Length: {}", provider_name, api_key.len());

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
        AiProvider::Groq => {
            // Groq uses OpenAI-compatible API, so reuse the same request structure
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
                .post(GROQ_API_URL)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("Failed to call Groq API: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(format!("Groq API error ({}): {}", status, text));
            }

            let chat_response: ChatResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

            chat_response
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| "Empty response from Groq".to_string())
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

    let os_context = build_os_context_header();
    
    // Build project type constraint
    let project_type_constraint = if let Some(ref project_type) = context.project_type {
        format!(
            r#"
PROJECT TYPE ENFORCEMENT:
- Detected Project Type: {}
- CRITICAL: You MUST use the package manager and build tools for this project type ONLY.
- NEGATIVE CONSTRAINTS:
  * If Project Type is "Java (Maven)" or "Java (Gradle)": DO NOT suggest npm, yarn, pnpm, pip, cargo, or go commands.
  * If Project Type is "Rust": DO NOT suggest npm, mvn, gradle, pip, or go commands.
  * If Project Type is "Python": DO NOT suggest npm, mvn, gradle, cargo, or go commands.
  * If Project Type is "Go": DO NOT suggest npm, mvn, gradle, pip, or cargo commands.
  * If Project Type is "Node.js": DO NOT suggest mvn, gradle, pip, cargo, or go commands.
- You MUST respect the detected project type. Suggesting the wrong package manager is a critical error."#,
            project_type
        )
    } else {
        String::new()
    };
    
    let system_prompt = format!(
        r#"You are a Senior Systems Engineer converting natural language to shell commands. Provide deep, technical explanations.

{}

Context: {}
{}

CRITICAL RULES:
1. Output ONLY valid JSON in this exact format: {{"commands": ["cmd1", "cmd2"], "warning": null, "explanation": "detailed technical explanation"}}
2. DO NOT include any markdown formatting (no ```, no code blocks)
3. DO NOT include any natural language explanations outside the JSON
4. DO NOT start responses with words like "Sure", "Create", "I'll", etc.
5. Output ONLY the raw JSON object, nothing else
6. If the command might be dangerous (rm -rf, format, etc.), set warning to a description
7. Use the context to determine the right package manager (npm/yarn/pnpm, pip/pip3, cargo, mvn, gradle, go, etc.)
8. For multi-step operations, provide commands in order
9. Never include secrets or sensitive data in commands
10. Prefer modern, cross-platform commands when possible, but ALWAYS use syntax compatible with the detected shell

EXPLANATION QUALITY REQUIREMENTS (for the "explanation" field):
- Explain like a Senior Engineer: Do not just say what it does; explain HOW it works technically.
- Break down flags: If the command has flags (e.g., `-f`, `--cached`, `-Force`), explicitly explain what each flag changes in the command's behavior.
- Context justification: Mention why this is the correct tool/command for the specific project context detected (e.g., "Uses npm because package.json detected").
- Technical depth: Instead of "List files", say "Lists files including hidden ones (-a flag) and displays permissions/ownership (-l flag) to help debug access issues. The long format shows file mode, link count, owner, group, size, and timestamp."
- Be dense, not verbose: High information per sentence, but avoid long paragraphs.

EXAMPLES:
- Bad: {{"commands": ["git add ."], "explanation": "Stage all changes"}}
- Good: {{"commands": ["git add ."], "explanation": "Stages all modified and untracked files in the current directory (.) to the Git index. The dot (.) is a pathspec that matches all files recursively. This prepares changes for commit by adding them to the staging area, which Git uses to build the next commit snapshot."}}

- Bad: {{"commands": ["ls -la"], "explanation": "List files"}}
- Good: {{"commands": ["Get-ChildItem -Force"], "explanation": "Lists all files including hidden ones (-Force flag) in PowerShell. The -Force parameter makes Get-ChildItem show hidden and system files that are normally filtered. Equivalent to Unix 'ls -a' but uses PowerShell's native cmdlet which respects Windows file attributes and permissions."}}

Remember: Output ONLY the JSON, no other text before or after it."#,
        os_context, context_str, project_type_constraint
    );

    let response = call_ai(&system_prompt, &redacted_text).await?;

    // Debug: Log raw response
    tracing::debug!("Raw AI response: {}", response);

    // Extract JSON from response (handles markdown code blocks, conversational text, etc.)
    let clean_text = extract_json_from_text(&response);
    
    // Debug: Log cleaned JSON
    tracing::debug!("Cleaned JSON string: {}", clean_text);
    println!("[DEBUG] Parsing JSON from cleaned string: {}", clean_text);

    let parsed: AiCommandResponse = serde_json::from_str(&clean_text)
        .map_err(|e| {
            let error_msg = format!(
                "Failed to parse AI response as JSON: {}\nRaw response: {}\nCleaned string: {}",
                e, response, clean_text
            );
            tracing::error!("{}", error_msg);
            error_msg
        })?;
    
    // Debug: Log parsed commands
    println!("[DEBUG] Parsed commands: {:?}", parsed.commands);
    tracing::debug!("Parsed {} command(s) from AI response", parsed.commands.len());
    
    // Sanitize each command before returning
    let sanitized_commands: Vec<String> = parsed.commands
        .into_iter()
        .map(|cmd| {
            let mut sanitized = cmd.trim().to_string();
            // Remove any remaining markdown or natural language
            sanitized = sanitized
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim()
                .to_string();
            sanitized
        })
        .collect();
    
    Ok(AiCommandResponse {
        commands: sanitized_commands,
        warning: parsed.warning,
        explanation: parsed.explanation,
    })
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

    // Detect "Not Found" errors - check for keywords
    let stderr_lower = redacted_stderr.to_lowercase();
    let is_not_found = stderr_lower.contains("not recognized")
        || stderr_lower.contains("command not found")
        || stderr_lower.contains("is not recognized as an internal or external command")
        || stderr_lower.contains("not found")
        || stderr_lower.contains("no such file or directory");

    // Conditional Logic: Branch based on error type
    if is_not_found {
        // ========== TYPO MODE: "Not Found" Errors ==========
        // For typos, we use a simple, focused prompt with NO context
        
        let os_context = build_os_context_header();
        let system_prompt = format!(
            r#"You are a Command Line Autocorrect tool. Your ONLY goal is to fix typos in command names.

{}

STRICT RULES:
1. Output ONLY valid JSON: {{"explanation": "<detailed technical explanation>", "fix": "<corrected command>", "confidence": "<high|medium|low>"}}
2. Do NOT use Markdown code blocks. Return raw JSON only.
3. Your ONLY job: Check if the command is a typo of a standard tool.
4. Common tools: git, npm, cargo, docker, python, node, sysinfo, ls, cd, mkdir, etc.
5. DO NOT suggest:
   - Package installation (npm install, pip install, etc.)
   - File creation (New-Item, mkdir, etc.)
   - Any commands based on project context
6. If it's clearly a typo, fix it. If not, return null for fix.
7. The corrected command MUST use syntax compatible with the detected shell above.

EXPLANATION QUALITY:
- Provide technical context: Explain what the corrected command does and why the typo caused it to fail.
- Mention the tool's purpose: Briefly explain what the tool is used for.
- Be educational: Help the user understand why the command failed (e.g., "Command not found because 'gti' is not in PATH; 'git' is the version control system that manages repository history").

EXAMPLES:
- "sysinf" → {{"explanation": "Typo detected: 'sysinf' should be 'sysinfo'. The sysinfo command displays system information including OS version, hardware details, and resource usage. The missing 'o' caused the shell to search PATH for 'sysinf', which doesn't exist.", "fix": "sysinfo", "confidence": "high"}}
- "gti status" → {{"explanation": "Typo: 'gti' should be 'git'. Git is a distributed version control system. The 'status' subcommand shows the working directory state, listing modified, staged, and untracked files. The typo caused the shell to fail because 'gti' is not a recognized command.", "fix": "git status", "confidence": "high"}}
- "unknown-command" → {{"explanation": "Command not found: The shell searched PATH environment variable for this executable but couldn't locate it. Possible causes: (1) Typo in command name, (2) Tool not installed, (3) Tool not in PATH. Check spelling or verify the tool is installed and accessible.", "fix": null, "confidence": "low"}}"#,
            os_context
        );

        let user_prompt = format!(
            "Command that failed: {}\nExit code: {}\nError output:\n{}",
            redacted_command, exit_code, redacted_stderr
        );

        let response = call_ai(&system_prompt, &user_prompt).await
            .map_err(|e| {
                tracing::error!("AI API call failed: {}", e);
                format!("AI API error: {}", e)
            })?;

        // Extract JSON from response (handles markdown code blocks, conversational text, etc.)
        let clean_text = extract_json_from_text(&response);
        
        tracing::debug!("AI raw response (first 500 chars): {}", &clean_text.chars().take(500).collect::<String>());

        let mut analysis: AiErrorAnalysis = serde_json::from_str(&clean_text)
            .map_err(|e| {
                tracing::error!("Failed to parse AI JSON response: {}", e);
                tracing::error!("Response was: {}", clean_text);
                format!("Failed to parse AI response as JSON: {}. Raw response: {}", e, clean_text.chars().take(200).collect::<String>())
            })?;

        // Normalize: If we have `fix` but no `fixes`, populate `fixes` for backward compatibility
        if let Some(ref fix) = analysis.fix {
            if analysis.fixes.is_empty() {
                analysis.fixes = vec![fix.clone()];
            }
        }

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
    } else {
        // ========== DEBUG MODE: Other Errors ==========
        // For other errors, use full context and debugging prompt
        
        // Get project context for debugging mode
        let context = cwd.map(scan_context).unwrap_or_default();
        let context_str = build_context_string(&context);

        // Build project type constraint
        let project_type_constraint = if let Some(ref project_type) = context.project_type {
            format!(
                r#"
PROJECT TYPE ENFORCEMENT:
- Detected Project Type: {}
- CRITICAL: You MUST use the package manager and build tools for this project type ONLY.
- NEGATIVE CONSTRAINTS:
  * If Project Type is "Java (Maven)" or "Java (Gradle)": DO NOT suggest npm, yarn, pnpm, pip, cargo, or go commands.
  * If Project Type is "Rust": DO NOT suggest npm, mvn, gradle, pip, or go commands.
  * If Project Type is "Python": DO NOT suggest npm, mvn, gradle, cargo, or go commands.
  * If Project Type is "Go": DO NOT suggest npm, mvn, gradle, pip, or cargo commands.
  * If Project Type is "Node.js": DO NOT suggest mvn, gradle, pip, cargo, or go commands.
- You MUST respect the detected project type. Suggesting the wrong package manager is a critical error."#,
                project_type
            )
        } else {
            String::new()
        };

        let os_context = build_os_context_header();
        let system_prompt = format!(
            r#"You are a Senior Systems Engineer performing root cause analysis on shell errors. Provide deep technical explanations.

{}
{}

RULES:
1. Output ONLY valid JSON: {{"explanation": "<detailed root cause analysis>", "fix": "<fix command>", "confidence": "<high|medium|low>"}}
2. Do NOT use Markdown code blocks. Return raw JSON only.
3. Analyze the error message carefully, identifying the technical root cause.
4. Use the project context to understand the environment, but prioritize the error message.
5. Suggest concrete fixes when possible, explaining WHY the fix works.
6. If the error mentions missing dependencies/modules, suggest installation commands with context.
7. If uncertain, return null for fix.
8. The fix command MUST use syntax compatible with the detected shell above.

EXPLANATION REQUIREMENTS (for the "explanation" field):
- Root Cause Analysis: Identify the technical reason for failure (e.g., "Process locked by another user," "Missing PATH entry," "Permission denied due to ACL," "Port already in use").
- Solution Context: Explain WHY the suggested fix works technically (e.g., "Adding to PATH allows the shell to locate the executable in standard search directories").
- Educational Value: Teach the user about the OS/Shell concept related to this error (e.g., "PATH is an environment variable containing colon-separated directories that the shell searches for executables").
- Technical Depth: Instead of "Command failed", explain the mechanism (e.g., "The command failed because the shell interpreter couldn't resolve the executable name. The shell searches directories in PATH in order, and if none contain an executable matching the name, it returns 'command not found'.").
- Be dense, not verbose: High information per sentence, technical accuracy over simplicity.

OUTPUT FORMAT:
- explanation: Deep technical root cause analysis with educational context (2-4 sentences, information-dense)
- fix: Single shell command that solves the problem, OR null if unclear
- confidence: "high" if very sure, "medium" if somewhat sure, "low" if uncertain

EXAMPLES:
- Error: "command not found: npm"
  Good: {{"explanation": "The shell couldn't find 'npm' because it's not in your PATH. Node.js installs npm, but the installation directory must be added to PATH. The shell searches PATH directories left-to-right for executables. Fix: Add Node.js bin directory to PATH or reinstall Node.js with PATH configuration.", "fix": "where.exe npm", "confidence": "high"}}

- Error: "Permission denied"
  Good: {{"explanation": "The file system denied write access due to insufficient permissions. On Windows, this could be ACL restrictions or file ownership. The current user lacks write permission on the target file/directory. Check file ownership (Get-Acl) and user permissions, or run with elevated privileges if appropriate.", "fix": "Get-Acl <file>", "confidence": "medium"}}"#,
            os_context, project_type_constraint
        );

        let user_prompt = format!(
            "Command that failed: {}\nExit code: {}\nError output (stderr):\n{}\n\nProject context: {}",
            redacted_command, exit_code, redacted_stderr, context_str
        );

        let response = call_ai(&system_prompt, &user_prompt).await
            .map_err(|e| {
                tracing::error!("AI API call failed: {}", e);
                format!("AI API error: {}", e)
            })?;

        // Extract JSON from response (handles markdown code blocks, conversational text, etc.)
        let clean_text = extract_json_from_text(&response);
        
        tracing::debug!("AI raw response (first 500 chars): {}", &clean_text.chars().take(500).collect::<String>());

        let mut analysis: AiErrorAnalysis = serde_json::from_str(&clean_text)
            .map_err(|e| {
                tracing::error!("Failed to parse AI JSON response: {}", e);
                tracing::error!("Response was: {}", clean_text);
                format!("Failed to parse AI response as JSON: {}. Raw response: {}", e, clean_text.chars().take(200).collect::<String>())
            })?;

        // Normalize: If we have `fix` but no `fixes`, populate `fixes` for backward compatibility
        if let Some(ref fix) = analysis.fix {
            if analysis.fixes.is_empty() {
                analysis.fixes = vec![fix.clone()];
            }
        }

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
}

/// Explain a command in detail
pub async fn explain_command(command: &str, cwd: Option<&str>) -> Result<AiExplanation, String> {
    let context = cwd.map(scan_context).unwrap_or_default();
    let context_str = build_context_string(&context);

    let os_context = build_os_context_header();
    let system_prompt = format!(
        r#"You are a Senior Systems Engineer teaching shell commands with deep technical expertise.

{}

Rules:
1. Output ONLY valid JSON: {{"summary": "<comprehensive technical summary>", "parts": [{{"token": "-x", "explain": "<detailed flag explanation>"}}, ...]}}
2. Break down every flag, option, and argument with technical depth
3. Use clear, technical language appropriate for engineers
4. Mention common gotchas, edge cases, and best practices
5. Explain the command in the context of the detected shell above

OUTPUT STRUCTURE REQUIREMENTS:
- summary: Comprehensive technical summary explaining what the command does, how it works internally, and when to use it. Include the command's role in the system (e.g., "Git's staging mechanism uses the index to prepare changes for commit").
- parts: Array of objects, each with:
  - token: The flag, option, or argument (e.g., "-f", "--force", "path/to/file")
  - explain: Deep technical explanation of what this specific token does, how it modifies behavior, and why you'd use it. Include technical details (e.g., "-f forces overwrite by bypassing file system safety checks, useful when you need to overwrite read-only files or when scripting").

EXPLANATION QUALITY:
- Technical Depth: Explain HOW the command works, not just WHAT it does (e.g., "The command reads file metadata from the filesystem inode table").
- Flag Breakdown: For each flag, explain the technical mechanism (e.g., "-a shows hidden files by including entries starting with '.' which Unix filesystems use to mark hidden files").
- Best Practices: Include when to use the command, common pitfalls, and performance considerations.
- Be dense, not verbose: High information per sentence, technical accuracy.

EXAMPLE:
Command: "git add -A"
Good Output:
{{
  "summary": "Stages all changes (modified, deleted, and untracked files) to Git's index. The index is a binary file (.git/index) that stores a snapshot of files for the next commit. Unlike 'git add .' which only adds files in the current directory, '-A' recursively stages changes across the entire repository, making it useful for committing all changes at once.",
  "parts": [
    {{"token": "git", "explain": "Git is a distributed version control system that tracks file changes using a content-addressable filesystem. The 'git' command is the main entry point."}},
    {{"token": "add", "explain": "The 'add' subcommand updates the staging area (index) with file changes. It doesn't commit yet; it prepares files for the next commit. Files must be staged before committing."}},
    {{"token": "-A", "explain": "The -A (or --all) flag stages all changes in the entire repository: modified tracked files, deleted files, and new untracked files. This is different from 'git add .' which only stages files in the current directory and subdirectories. Equivalent to 'git add --all'."}}
  ]
}}"#,
        os_context
    );

    let user_prompt = format!(
        "Explain this command: {}\n\nContext: {}",
        command, context_str
    );

    let response = call_ai(&system_prompt, &user_prompt).await?;

    // Extract JSON from response (handles markdown code blocks, conversational text, etc.)
    let clean_text = extract_json_from_text(&response);

    serde_json::from_str(&clean_text).map_err(|e| format!("Failed to parse AI response: {}", e))
}

/// Generate a workflow from natural language description
pub async fn generate_workflow(
    description: &str,
    cwd: Option<&str>,
) -> Result<Vec<serde_json::Value>, String> {
    let context = cwd.map(scan_context).unwrap_or_default();
    let context_str = build_context_string(&context);

    let os_context = build_os_context_header();
    let system_prompt = format!(
        r#"You are a DevOps expert creating automation workflows.

{}

Rules:
1. Output ONLY a valid JSON array of workflow steps
2. Format: [{{"step": 1, "cmd": "...", "cwd": ".", "continue_on_fail": false}}, ...]
3. Keep workflows simple (2-5 steps)
4. Each step should be a complete, runnable command
5. Use context to determine appropriate commands
6. All commands MUST use syntax compatible with the detected shell above"#,
        os_context
    );

    let user_prompt = format!(
        "Create a workflow for: {}\n\nContext: {}",
        description, context_str
    );

    let response = call_ai(&system_prompt, &user_prompt).await?;

    // Extract JSON from response (handles markdown code blocks, conversational text, etc.)
    let clean_text = extract_json_from_text(&response);

    serde_json::from_str(&clean_text).map_err(|e| format!("Failed to parse workflow: {}", e))
}

/// Set the API key for current provider
pub fn set_api_key(key: &str) -> Result<(), String> {
    let provider = get_provider();
    match provider {
        AiProvider::Gemini => db::set_preference("gemini_api_key", key).map_err(|e| e.to_string()),
        AiProvider::OpenAI => db::set_preference("openai_api_key", key).map_err(|e| e.to_string()),
        AiProvider::Groq => db::set_preference("groq_api_key", key).map_err(|e| e.to_string()),
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

/// Set Groq API key
pub fn set_groq_api_key(key: &str) -> Result<(), String> {
    // Ensure provider is set to groq when setting the key
    db::set_preference("ai_provider", "groq").map_err(|e| e.to_string())?;
    db::set_preference("groq_api_key", key).map_err(|e| e.to_string())
}

/// Set the AI provider (gemini, openai, or groq)
pub fn set_provider(provider: &str) -> Result<(), String> {
    match provider {
        "gemini" | "openai" | "groq" => db::set_preference("ai_provider", provider).map_err(|e| e.to_string()),
        _ => Err("Provider must be 'gemini', 'openai', or 'groq'".to_string()),
    }
}

/// Set the model to use for current provider
pub fn set_model(model: &str) -> Result<(), String> {
    let provider = get_provider();
    match provider {
        AiProvider::Gemini => db::set_preference("gemini_model", model).map_err(|e| e.to_string()),
        AiProvider::OpenAI => db::set_preference("openai_model", model).map_err(|e| e.to_string()),
        AiProvider::Groq => db::set_preference("groq_model", model).map_err(|e| e.to_string()),
    }
}

/// Check if AI is configured
pub fn is_configured() -> bool {
    let provider = get_provider();
    if let Ok(key) = get_api_key(&provider) {
        !key.trim().is_empty()
    } else {
        false
    }
}

/// Clear API key for current provider
pub fn clear_api_key() -> Result<(), String> {
    let provider = get_provider();
    match provider {
        AiProvider::Gemini => {
            // Clear API key and reset model to default
            db::set_preference("gemini_api_key", "").map_err(|e| e.to_string())?;
            db::set_preference("gemini_model", "gemini-2.5-flash").map_err(|e| e.to_string())?;
            Ok(())
        }
        AiProvider::OpenAI => {
            db::set_preference("openai_api_key", "").map_err(|e| e.to_string())
        }
        AiProvider::Groq => {
            // Clear API key and reset model to default
            db::set_preference("groq_api_key", "").map_err(|e| e.to_string())?;
            db::set_preference("groq_model", "openai/gpt-oss-120b").map_err(|e| e.to_string())?;
            Ok(())
        }
    }
}


