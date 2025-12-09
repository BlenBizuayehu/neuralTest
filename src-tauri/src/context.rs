use std::fs;
use std::path::Path;

use crate::models::Context;

/// Scan the directory for project context
pub fn scan_context(cwd: &str) -> Context {
    let path = Path::new(cwd);
    
    let mut ctx = Context {
        cwd: cwd.to_string(),
        ..Default::default()
    };
    
    // Check for various project markers
    ctx.has_package_json = path.join("package.json").exists();
    ctx.has_cargo_toml = path.join("Cargo.toml").exists();
    ctx.has_requirements_txt = path.join("requirements.txt").exists();
    ctx.has_manage_py = path.join("manage.py").exists();
    ctx.has_composer_json = path.join("composer.json").exists();
    ctx.has_git = path.join(".git").exists();
    
    // Determine project type
    ctx.project_type = detect_project_type(&ctx);
    
    // Extract npm scripts if Node project
    if ctx.has_package_json {
        ctx.npm_scripts = extract_npm_scripts(path);
    }
    
    ctx
}

/// Detect the primary project type
fn detect_project_type(ctx: &Context) -> Option<String> {
    if ctx.has_manage_py {
        Some("Django".to_string())
    } else if ctx.has_requirements_txt {
        Some("Python".to_string())
    } else if ctx.has_cargo_toml {
        Some("Rust".to_string())
    } else if ctx.has_package_json {
        Some("Node.js".to_string())
    } else if ctx.has_composer_json {
        Some("PHP".to_string())
    } else {
        None
    }
}

/// Extract npm scripts from package.json
fn extract_npm_scripts(path: &Path) -> Option<Vec<String>> {
    let package_json_path = path.join("package.json");
    
    if let Ok(content) = fs::read_to_string(package_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = json.get("scripts") {
                if let Some(obj) = scripts.as_object() {
                    return Some(obj.keys().cloned().collect());
                }
            }
        }
    }
    
    None
}

/// Build a context string for AI prompts
pub fn build_context_string(ctx: &Context) -> String {
    let mut parts = Vec::new();
    
    if let Some(ref project_type) = ctx.project_type {
        parts.push(format!("Project type: {}", project_type));
    }
    
    parts.push(format!("Working directory: {}", ctx.cwd));
    
    let mut markers = Vec::new();
    if ctx.has_package_json { markers.push("package.json"); }
    if ctx.has_cargo_toml { markers.push("Cargo.toml"); }
    if ctx.has_requirements_txt { markers.push("requirements.txt"); }
    if ctx.has_manage_py { markers.push("manage.py"); }
    if ctx.has_composer_json { markers.push("composer.json"); }
    if ctx.has_git { markers.push(".git"); }
    
    if !markers.is_empty() {
        parts.push(format!("Project markers found: {}", markers.join(", ")));
    }
    
    if let Some(ref scripts) = ctx.npm_scripts {
        if !scripts.is_empty() {
            parts.push(format!("Available npm scripts: {}", scripts.join(", ")));
        }
    }
    
    parts.join(". ")
}

/// Walk up directories to find the nearest project root
pub fn find_project_root(start: &str) -> Option<String> {
    let mut current = Path::new(start);
    
    let project_markers = [
        "package.json",
        "Cargo.toml",
        "requirements.txt",
        "manage.py",
        "composer.json",
        ".git",
    ];
    
    loop {
        for marker in &project_markers {
            if current.join(marker).exists() {
                return Some(current.to_string_lossy().to_string());
            }
        }
        
        match current.parent() {
            Some(parent) => current = parent,
            None => break,
        }
    }
    
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_scan_context_current_dir() {
        let cwd = env::current_dir().unwrap();
        let ctx = scan_context(cwd.to_str().unwrap());
        assert!(!ctx.cwd.is_empty());
    }
}


