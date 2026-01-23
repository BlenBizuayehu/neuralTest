use std::fs;
use std::path::Path;
use regex::Regex;

use crate::models::{Context, NpmScript};

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
    ctx.has_pipfile = path.join("Pipfile").exists();
    ctx.has_pyproject_toml = path.join("pyproject.toml").exists();
    ctx.has_manage_py = path.join("manage.py").exists();
    ctx.has_composer_json = path.join("composer.json").exists();
    ctx.has_pom_xml = path.join("pom.xml").exists();
    ctx.has_build_gradle = path.join("build.gradle").exists();
    ctx.has_build_gradle_kts = path.join("build.gradle.kts").exists();
    ctx.has_go_mod = path.join("go.mod").exists();
    ctx.has_git = path.join(".git").exists();
    ctx.has_dockerfile = path.join("Dockerfile").exists();
    ctx.has_docker_compose = path.join("docker-compose.yml").exists() 
        || path.join("docker-compose.yaml").exists();
    ctx.has_makefile = path.join("Makefile").exists() 
        || path.join("makefile").exists();
    
    // Determine project type
    ctx.project_type = detect_project_type(&ctx);
    
    // Extract detailed metadata
    if ctx.has_package_json {
        ctx.npm_scripts = extract_npm_scripts(path);
        ctx.npm_scripts_detailed = extract_npm_scripts_detailed(path);
    }
    
    if ctx.has_cargo_toml {
        ctx.cargo_binaries = extract_cargo_binaries(path);
    }
    
    if ctx.has_makefile {
        ctx.makefile_targets = extract_makefile_targets(path);
    }
    
    ctx
}

/// Detect the primary project type
/// Priority order: Rust -> Java (Maven) -> Java (Gradle) -> Python -> Go -> Node.js -> PHP
fn detect_project_type(ctx: &Context) -> Option<String> {
    // 1. Rust
    if ctx.has_cargo_toml {
        return Some("Rust".to_string());
    }
    
    // 2. Java (Maven)
    if ctx.has_pom_xml {
        return Some("Java (Maven)".to_string());
    }
    
    // 3. Java (Gradle)
    if ctx.has_build_gradle || ctx.has_build_gradle_kts {
        return Some("Java (Gradle)".to_string());
    }
    
    // 4. Python (check multiple markers)
    if ctx.has_requirements_txt || ctx.has_pipfile || ctx.has_pyproject_toml || ctx.has_manage_py {
        if ctx.has_manage_py {
            return Some("Django".to_string());
        }
        return Some("Python".to_string());
    }
    
    // 5. Go
    if ctx.has_go_mod {
        return Some("Go".to_string());
    }
    
    // 6. Node.js
    if ctx.has_package_json {
        return Some("Node.js".to_string());
    }
    
    // 7. PHP
    if ctx.has_composer_json {
        return Some("PHP".to_string());
    }
    
    None
}

/// Extract npm scripts from package.json (legacy: just names)
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

/// Extract npm scripts with their commands from package.json
fn extract_npm_scripts_detailed(path: &Path) -> Option<Vec<NpmScript>> {
    let package_json_path = path.join("package.json");
    
    if let Ok(content) = fs::read_to_string(package_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = json.get("scripts") {
                if let Some(obj) = scripts.as_object() {
                    let mut result = Vec::new();
                    for (name, value) in obj {
                        if let Some(cmd) = value.as_str() {
                            result.push(NpmScript {
                                name: name.clone(),
                                command: cmd.to_string(),
                            });
                        }
                    }
                    if !result.is_empty() {
                        return Some(result);
                    }
                }
            }
        }
    }
    
    None
}

/// Extract Rust binaries from Cargo.toml
fn extract_cargo_binaries(path: &Path) -> Option<Vec<String>> {
    let cargo_toml_path = path.join("Cargo.toml");
    
    if let Ok(content) = fs::read_to_string(cargo_toml_path) {
        // Simple parsing: look for [bin] sections
        // This is a basic implementation; for production, consider using toml crate
        let mut binaries = Vec::new();
        let mut in_bin_section = false;
        let name_re = Regex::new(r#"name\s*=\s*"([^"]+)""#).ok()?;
        
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("[") && trimmed.contains("bin") {
                in_bin_section = true;
            } else if trimmed.starts_with("[") && !trimmed.contains("bin") {
                in_bin_section = false;
            } else if in_bin_section {
                if let Some(caps) = name_re.captures(trimmed) {
                    if let Some(name) = caps.get(1) {
                        binaries.push(name.as_str().to_string());
                    }
                }
            }
        }
        
        // If no explicit binaries found, check if it's a binary crate
        if binaries.is_empty() {
            // Check for [package] name - if it exists, it's likely a binary
            let name_in_package_re = Regex::new(r#"name\s*=\s*"([^"]+)""#).ok()?;
            let mut in_package = false;
            
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("[package]") {
                    in_package = true;
                } else if trimmed.starts_with("[") {
                    in_package = false;
                } else if in_package {
                    if let Some(caps) = name_in_package_re.captures(trimmed) {
                        if let Some(name) = caps.get(1) {
                            binaries.push(name.as_str().to_string());
                            break;
                        }
                    }
                }
            }
        }
        
        if !binaries.is_empty() {
            return Some(binaries);
        }
    }
    
    None
}

/// Extract Makefile targets
fn extract_makefile_targets(path: &Path) -> Option<Vec<String>> {
    let makefile_path = if path.join("Makefile").exists() {
        path.join("Makefile")
    } else {
        path.join("makefile")
    };
    
    if let Ok(content) = fs::read_to_string(makefile_path) {
        // Regex to match Makefile targets (lines starting with target:)
        let target_re = Regex::new(r"^([a-zA-Z0-9_-]+)\s*:").ok()?;
        let mut targets = Vec::new();
        
        for line in content.lines() {
            if let Some(caps) = target_re.captures(line) {
                if let Some(target) = caps.get(1) {
                    let target_name = target.as_str();
                    // Skip common phony targets that are just helpers
                    if target_name != ".PHONY" && !target_name.starts_with('.') {
                        targets.push(target_name.to_string());
                    }
                }
            }
        }
        
        if !targets.is_empty() {
            return Some(targets);
        }
    }
    
    None
}

/// Build a context string for AI prompts
pub fn build_context_string(ctx: &Context) -> String {
    let mut sections = Vec::new();
    
    // Project Type and Build System
    let mut project_info = Vec::new();
    if let Some(ref project_type) = ctx.project_type {
        project_info.push(format!("Type: {}", project_type));
    }
    
    // Determine build system based on project type
    let build_system = match ctx.project_type.as_deref() {
        Some("Rust") => "cargo",
        Some("Java (Maven)") => "mvn",
        Some("Java (Gradle)") => "gradle",
        Some("Python") | Some("Django") => "pip/pipenv",
        Some("Go") => "go",
        Some("Node.js") => "npm/yarn/pnpm",
        Some("PHP") => "composer",
        _ => "unknown",
    };
    project_info.push(format!("Build System: {}", build_system));
    
    if !project_info.is_empty() {
        sections.push(format!("PROJECT CONTEXT:\n- {}", project_info.join("\n- ")));
    }
    
    // NPM Scripts (detailed)
    if let Some(ref scripts) = ctx.npm_scripts_detailed {
        if !scripts.is_empty() {
            let mut script_lines = Vec::new();
            script_lines.push("Detected Scripts:".to_string());
            for script in scripts {
                script_lines.push(format!("  * '{}': Runs '{}'", script.name, script.command));
            }
            sections.push(script_lines.join("\n"));
        }
    }
    
    // Rust Binaries
    if let Some(ref binaries) = ctx.cargo_binaries {
        if !binaries.is_empty() {
            sections.push(format!("Rust Binaries: {}", binaries.join(", ")));
        } else {
            sections.push("Rust Binary: Default (cargo run)".to_string());
        }
    } else if ctx.has_cargo_toml {
        sections.push("Rust Binary: Default (cargo run)".to_string());
    }
    
    // Makefile Targets
    if let Some(ref targets) = ctx.makefile_targets {
        if !targets.is_empty() {
            sections.push(format!("Makefile Targets: {}", targets.join(", ")));
        }
    }
    
    // Python Requirements
    if ctx.has_requirements_txt {
        sections.push("Python Requirements: requirements.txt found".to_string());
    }
    if ctx.has_pipfile {
        sections.push("Python Requirements: Pipfile found (pipenv)".to_string());
    }
    
    // Docker
    let mut docker_info = Vec::new();
    if ctx.has_dockerfile {
        docker_info.push("Dockerfile");
    }
    if ctx.has_docker_compose {
        docker_info.push("docker-compose.yml");
    }
    if !docker_info.is_empty() {
        sections.push(format!("Docker: Yes ({})", docker_info.join(", ")));
    }
    
    // Working Directory
    sections.push(format!("Working Directory: {}", ctx.cwd));
    
    sections.join("\n")
}

/// Walk up directories to find the nearest project root
pub fn find_project_root(start: &str) -> Option<String> {
    let mut current = Path::new(start);
    
    let project_markers = [
        "package.json",
        "Cargo.toml",
        "requirements.txt",
        "pyproject.toml",
        "Pipfile",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "go.mod",
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


