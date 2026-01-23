# Command Execution Lifecycle Diagnosis

## Executive Summary

**The Terminal has "Amnesia"** - Each command spawns a **NEW** process that dies immediately after execution. There is **NO persistent shell session**.

---

## 1. Frontend State Analysis (`Terminal.jsx`)

### Current Working Directory (CWD) Management

**Location:** `project-neural/src/components/Terminal/Terminal.jsx`

- **Line 20:** Component receives `cwd` as a prop from parent (`App.jsx`)
- **Line 308:** Every command execution passes `cwd` to backend: `runCommand(cmd, cwd, false, false)`
- **Line 272-278:** Special handling for `cd` command:
  ```javascript
  if (cmd.startsWith('cd ')) {
    const newDir = cmd.slice(3).trim();
    onCwdChange?.(newDir);  // Updates React state ONLY
    return;  // Does NOT execute in shell
  }
  ```

**Key Finding:** 
- ✅ Frontend **DOES** track CWD in React state
- ✅ Frontend **DOES** pass `cwd` to backend for every command
- ❌ `cd` command is handled **client-side only** - never reaches the shell

### Environment Variables

**Location:** `project-neural/src/services/tauriClient.js`

- **Line 86-91:** `runCommand()` function passes `cwd` but **NO environment variables**
- **No state management** for environment variables anywhere in frontend

**Key Finding:**
- ❌ Environment variables are **NOT tracked** in frontend
- ❌ Environment variables are **NOT passed** to backend

---

## 2. Backend Execution Analysis (`runner.rs`)

### Process Spawning - THE SMOKING GUN 🔫

**Location:** `project-neural/src-tauri/src/runner.rs`

#### Windows Execution (Lines 65-83):
```rust
#[cfg(target_os = "windows")]
let mut cmd = {
    // ... directory resolution ...
    
    let mut cmd = Command::new("powershell");  // ← NEW process every time!
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &command]);
    cmd.current_dir(resolved_dir);  // ← Uses cwd parameter
    cmd
};
```

#### Process Lifecycle (Lines 94-179):
```rust
// Line 94-98: Spawn NEW process
let mut child = cmd
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()  // ← Fresh process spawned
    .map_err(|e| format!("Failed to spawn command: {}", e))?;

// Line 104: Store temporarily for cancellation
RUNNING_PROCESSES.lock().insert(id, child);

// Line 172-179: Process dies after execution
let child_opt = {
    let mut processes = RUNNING_PROCESSES.lock();
    processes.remove(&id)  // ← Removed from map
};

let exit_code = if let Some(mut child) = child_opt {
    match child.wait().await {  // ← Wait for process to die
        Ok(status) => status.code().unwrap_or(-1),
        Err(_) => -1,
    }
} else {
    -1
};
```

**Critical Evidence:**
1. **Line 78:** `Command::new("powershell")` - Creates a **NEW** PowerShell process
2. **Line 80:** `-NoProfile -NonInteractive` - Ensures **FRESH** session (no profile, no persistence)
3. **Line 94-98:** `.spawn()` - Spawns the process
4. **Line 172-179:** Process is **removed and awaited** - it **DIES** after execution

**Key Finding:**
- ❌ **NO persistent shell process**
- ❌ **NO stdin/stdout connection** to a long-lived process
- ✅ **DOES use** `cwd` parameter via `cmd.current_dir(resolved_dir)` (line 81)

---

## 3. State Persistence Analysis

### Current Working Directory

**Frontend State:**
- ✅ Stored in React state (`App.jsx` line 14: `const [cwd, setCwd] = useState(null)`)
- ✅ Updated when `cd` command is executed (`Terminal.jsx` line 274: `onCwdChange?.(newDir)`)
- ✅ Passed to backend for every command (`Terminal.jsx` line 308)

**Backend State:**
- ✅ **Used** via `cmd.current_dir(resolved_dir)` (runner.rs line 81)
- ❌ **NOT stored** in any backend state struct
- ❌ **NOT persisted** across commands (each command gets it as a parameter)

**Verdict:** `cd` **PARTIALLY WORKS** because:
- Frontend tracks it and passes it to backend
- Backend uses it for `current_dir()`
- But it's not a "real" shell `cd` - it's just a parameter

### Environment Variables

**Frontend State:**
- ❌ **NOT tracked** anywhere
- ❌ **NOT passed** to backend

**Backend State:**
- ❌ **NOT stored** in any state struct
- ❌ **NOT inherited** from previous commands (each process is fresh)

**Verdict:** `export VAR=value` **DOES NOT WORK** because:
- No state management for env vars
- Each process spawns fresh with system defaults only
- No mechanism to pass env vars between commands

---

## 4. The Diagnosis

### 🧠 "Amnesia" vs "Session"

**Your terminal has "Amnesia"** - it's like having a goldfish memory:

1. You type `cd ..`
   - Frontend remembers: ✅ (updates React state)
   - Backend forgets: ❌ (no persistent state)
   - Next command uses the `cwd` parameter: ✅ (works via parameter passing)

2. You type `export MY_VAR=1`
   - Frontend forgets: ❌ (no tracking)
   - Backend forgets: ❌ (no state)
   - Next command spawns fresh process: ❌ (env var is gone)

3. You type `echo $MY_VAR`
   - Spawns NEW PowerShell process
   - Process has NO memory of previous `export`
   - Variable doesn't exist: ❌

### 📍 The Code Culprit

**File:** `project-neural/src-tauri/src/runner.rs`

**Lines 78-98:** The process is born and dies here:
```rust
let mut cmd = Command::new("powershell");  // ← NEW process
cmd.args(["-NoProfile", "-NonInteractive", "-Command", &command]);
cmd.current_dir(resolved_dir);
let mut child = cmd.spawn()?;  // ← Process spawned
// ... process runs ...
// Line 172-179: Process dies after execution
```

**Proof it dies:**
- Line 169: `processes.remove(&id)` - Removed from active processes
- Line 173: `child.wait().await` - Waits for process to exit
- Process exits immediately after command completes
- No persistent connection maintained

---

## 5. The Verdict

### 🎯 **STATELESS RUNNER** Pattern

Your system uses a **Stateless Runner** architecture:

**Characteristics:**
- ✅ Each command spawns a fresh process
- ✅ Process dies immediately after execution
- ✅ No persistent shell session
- ✅ CWD passed as parameter (works for `cd`)
- ❌ Environment variables not persisted (doesn't work for `export`)

**Complexity Assessment:**

| Feature | Difficulty | Reason |
|---------|-----------|--------|
| Fix `cd` | 🟢 **EASY** | Already partially works via parameter passing. Just need to ensure frontend properly resolves relative paths. |
| Fix `export VAR=value` | 🔴 **HARD** | Requires implementing a state management system for environment variables and passing them to each spawned process. |

**Current State:**
- `cd` works **partially** (via parameter passing, not true shell state)
- `export VAR=value` **does not work** (no state management)

---

## 6. Architecture Comparison

### Current: Stateless Runner
```
Frontend → Backend → Spawn Process → Execute → Process Dies
   ↓         ↓            ↓            ↓          ↓
  cwd      cwd param   NEW process   Run cmd    Exit
  state    passed      each time     in cwd     (forget)
```

### Alternative: Stateful Shell (Not Implemented)
```
Frontend → Backend → Persistent Shell Process
   ↓         ↓            ↓
  cwd      stdin      Shell Session
  state    write      (remembers state)
```

---

## 7. Recommendations

### For `cd` Command:
1. ✅ **Already works** via parameter passing
2. ⚠️ **Enhancement needed:** Properly resolve relative paths in frontend
3. ⚠️ **Enhancement needed:** Handle `cd` without arguments (go to home)

### For `export VAR=value`:
1. 🔴 **Requires implementation:**
   - Add environment variable state management (frontend + backend)
   - Store env vars in a `HashMap<String, String>` in backend
   - Pass env vars to each spawned process via `cmd.env()` or `cmd.envs()`
   - Handle `export` command parsing in frontend (similar to `cd`)

### Implementation Complexity:
- **Stateless Runner:** Current implementation (simple, but limited)
- **Stateful Shell:** Would require persistent process management (complex, but more powerful)

---

## Summary

**Diagnosis:** Your terminal has "Amnesia" - it's a **Stateless Runner**.

**Culprit:** `runner.rs` lines 78-98 spawn a new process for every command that dies immediately.

**Verdict:** **Stateless Runner** - Easy to fix `cd` (already mostly works), hard to fix `export VAR=value` (requires state management system).
