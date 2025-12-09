use regex::Regex;
use once_cell::sync::Lazy;

use crate::models::DangerWarning;

// Patterns for sensitive data detection
static SENSITIVE_PATTERNS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
    vec![
        // API Keys
        (Regex::new(r#"(?i)(api[_-]?key|apikey)\s*[=:]\s*["']?[A-Za-z0-9\-_]{16,}["']?"#).unwrap(), "API Key"),
        // AWS Access Key
        (Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(), "AWS Access Key"),
        // AWS Secret Key
        (Regex::new(r#"(?i)(aws[_-]?secret|secret[_-]?key)\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?"#).unwrap(), "AWS Secret"),
        // Generic Secret/Password
        (Regex::new(r#"(?i)(password|passwd|pwd|secret)\s*[=:]\s*["']?[^\s"']{8,}["']?"#).unwrap(), "Password/Secret"),
        // JWT Token
        (Regex::new(r"eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*").unwrap(), "JWT Token"),
        // Private Key Block
        (Regex::new(r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----").unwrap(), "Private Key"),
        // Bearer Token
        (Regex::new(r#"(?i)bearer\s+[A-Za-z0-9\-_.]+"#).unwrap(), "Bearer Token"),
        // GitHub Token
        (Regex::new(r"gh[pousr]_[A-Za-z0-9_]{36,}").unwrap(), "GitHub Token"),
        // Slack Token
        (Regex::new(r"xox[baprs]-[0-9A-Za-z\-]+").unwrap(), "Slack Token"),
        // Generic Token
        (Regex::new(r#"(?i)(token|auth)\s*[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?"#).unwrap(), "Token"),
    ]
});

// Dangerous command patterns
static DANGEROUS_PATTERNS: Lazy<Vec<(Regex, &'static str, &'static str)>> = Lazy::new(|| {
    vec![
        // rm -rf / or similar
        (Regex::new(r"rm\s+(-[rRf]+\s+)*(/|/\*|\.\.|~/|~)").unwrap(), "Recursive delete of critical paths", "high"),
        // Fork bomb
        (Regex::new(r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:").unwrap(), "Fork bomb detected", "high"),
        // Curl piped to shell
        (Regex::new(r"curl\s+[^\|]+\|\s*(ba)?sh").unwrap(), "Piping curl to shell is risky", "medium"),
        (Regex::new(r"wget\s+[^\|]+\|\s*(ba)?sh").unwrap(), "Piping wget to shell is risky", "medium"),
        // dd to disk
        (Regex::new(r"dd\s+.*of=/dev/(sd[a-z]|nvme|hd[a-z])").unwrap(), "Direct disk write detected", "high"),
        // chmod 777
        (Regex::new(r"chmod\s+(-R\s+)?777").unwrap(), "Setting world-writable permissions", "medium"),
        // mkfs without confirmation
        (Regex::new(r"mkfs\s+").unwrap(), "Filesystem format command", "high"),
        // Format command (Windows)
        (Regex::new(r"(?i)format\s+[a-z]:").unwrap(), "Disk format command", "high"),
        // Overwrite system files
        (Regex::new(r">\s*/etc/(passwd|shadow|sudoers)").unwrap(), "Overwriting system files", "high"),
        // Shutdown/reboot
        (Regex::new(r"(?i)(shutdown|reboot|halt|poweroff)\s").unwrap(), "System shutdown/reboot command", "low"),
    ]
});

/// Redact sensitive information from text
pub fn redact_sensitive(text: &str) -> String {
    let mut result = text.to_string();
    
    for (pattern, _name) in SENSITIVE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "***REDACTED***").to_string();
    }
    
    result
}

/// Check if text contains sensitive information
pub fn contains_sensitive(text: &str) -> bool {
    for (pattern, _) in SENSITIVE_PATTERNS.iter() {
        if pattern.is_match(text) {
            return true;
        }
    }
    false
}

/// Get list of detected sensitive items (for UI warning)
pub fn detect_sensitive_items(text: &str) -> Vec<String> {
    let mut items = Vec::new();
    
    for (pattern, name) in SENSITIVE_PATTERNS.iter() {
        if pattern.is_match(text) {
            items.push(name.to_string());
        }
    }
    
    items
}

/// Validate a command for dangerous patterns
pub fn validate_command(command: &str) -> Option<DangerWarning> {
    for (pattern, reason, severity) in DANGEROUS_PATTERNS.iter() {
        if pattern.is_match(command) {
            return Some(DangerWarning {
                command: command.to_string(),
                reason: reason.to_string(),
                severity: severity.to_string(),
            });
        }
    }
    None
}

/// Check if command is interactive (won't work in non-tty)
pub fn is_interactive_command(command: &str) -> bool {
    let interactive_commands = [
        "vim", "vi", "nano", "emacs", "less", "more", "htop", "top",
        "ssh", "telnet", "ftp", "python", "node", "irb", "ghci",
    ];
    
    let first_word = command.split_whitespace().next().unwrap_or("");
    let base_cmd = first_word.rsplit('/').next().unwrap_or(first_word);
    
    interactive_commands.contains(&base_cmd)
}

/// Detect if output is binary/non-UTF8
pub fn is_binary_output(data: &[u8]) -> bool {
    // Check for null bytes or high concentration of non-printable chars
    let non_printable_count = data.iter()
        .take(1024) // Check first 1KB
        .filter(|&&b| b == 0 || (b < 32 && b != 9 && b != 10 && b != 13))
        .count();
    
    non_printable_count > data.len().min(1024) / 10
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_api_key() {
        let input = "API_KEY=sk-1234567890abcdef1234567890abcdef";
        let result = redact_sensitive(input);
        assert!(result.contains("***REDACTED***"));
        assert!(!result.contains("sk-1234567890"));
    }

    #[test]
    fn test_dangerous_rm() {
        let warning = validate_command("rm -rf /");
        assert!(warning.is_some());
        assert_eq!(warning.unwrap().severity, "high");
    }

    #[test]
    fn test_safe_command() {
        let warning = validate_command("ls -la");
        assert!(warning.is_none());
    }

    #[test]
    fn test_interactive_detection() {
        assert!(is_interactive_command("vim file.txt"));
        assert!(is_interactive_command("htop"));
        assert!(!is_interactive_command("ls -la"));
    }
}


