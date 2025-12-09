# 🚀 How to Run Project Neural - Step by Step Guide

## Prerequisites Check

Before starting, make sure you have:
- ✅ **Rust** installed (check with `rustc --version`)
- ✅ **Node.js** 20.19+ or 22.12+ (check with `node --version`)
- ✅ **npm** installed (comes with Node.js)

If missing, install:
- Rust: https://www.rust-lang.org/tools/install
- Node.js: https://nodejs.org/

---

## Step 1: Get Your FREE Gemini API Key

### Option A: Quick Method (30 seconds)
1. Open browser: https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click **"Create API Key"** button
4. Copy the key (starts with `AIza...`)
5. **Save it somewhere safe** - you'll need it in Step 3

### Option B: If you already have a key
- Just make sure it starts with `AIza...`

---

## Step 2: Navigate to Project Directory

Open your terminal/command prompt and run:

```bash
cd C:\Users\hp\OneDrive\Desktop\projects\warp\project-neural
```

Or if you're already in the project folder, skip this step.

---

## Step 3: Install Dependencies (First Time Only)

Run this command:

```bash
npm install
```

**Wait for it to finish** - this downloads all JavaScript packages (takes 1-2 minutes).

---

## Step 4: Run the Application

Start the development server:

```bash
npm run tauri dev
```

**What happens:**
1. First time: Rust will compile everything (takes 5-10 minutes) ⏳
2. After that: Much faster (30 seconds - 2 minutes)
3. The app window will open automatically 🪟

**You'll see:**
- Terminal output showing compilation progress
- A window will pop up with "Project Neural" interface
- Welcome message in the terminal

---

## Step 5: Configure Gemini API Key

Once the app is open:

1. **Click the "✨ AI" button** in the top-right corner
   - Or press `Ctrl+Shift+P`

2. **Select "Gemini (Free, Recommended)"** radio button

3. **Paste your API key** (the one you got in Step 1)

4. **Click "Save"**

5. You should see: "Gemini API key configured successfully!"

---

## Step 6: Test It Out! 🎉

### Test 1: Natural Language to Command
1. Click the **"✨ AI"** button again
2. Type: `create a folder called test1`
3. Press Enter or click Send
4. AI will generate: `mkdir test1`
5. Click the **▶ Run** button next to the command
6. Check - the folder should be created!

### Test 2: Direct Command
1. In the terminal, type: `ls` (or `dir` on Windows)
2. Press Enter
3. See the file listing appear!

### Test 3: Error Fix
1. Try running: `python nonexistent.py`
2. Wait for error
3. AI will automatically suggest fixes!

---

## Troubleshooting

### ❌ "Rust not found"
**Solution:**
```bash
# Install Rust
winget install Rustlang.Rustup
# Then restart terminal and try again
```

### ❌ "Node.js version too old"
**Solution:**
- Update Node.js: https://nodejs.org/
- Or use Node Version Manager (nvm)

### ❌ "npm install fails"
**Solution:**
```bash
# Clear cache and retry
npm cache clean --force
npm install
```

### ❌ "Compilation errors"
**Solution:**
```bash
# Clean and rebuild
cd src-tauri
cargo clean
cd ..
npm run tauri dev
```

### ❌ "Gemini API error 404"
**Solution:**
- The model name might be wrong
- Check you're using the latest code
- Try restarting the app

### ❌ "API key not working"
**Solution:**
1. Make sure you selected "Gemini" (not OpenAI)
2. Check key starts with `AIza...`
3. Get a new key: https://makersuite.google.com/app/apikey
4. Make sure you saved it in the app

---

## Quick Reference

### Keyboard Shortcuts
- `Ctrl+Shift+P` - Open AI Assistant
- `Ctrl+Shift+W` - Open Workflow Runner
- `Escape` - Close panels
- `↑/↓` - Navigate command history

### Common Commands
- `cd <folder>` - Change directory
- `ls` / `dir` - List files
- `clear` / `cls` - Clear terminal
- `pwd` - Show current directory

### AI Features
- Natural language → Commands
- Error analysis & fixes
- Command explanations
- Workflow generation

---

## Building for Production

When you're ready to create an executable:

```bash
npm run tauri build
```

This creates:
- Windows: `.exe` file in `src-tauri/target/release/`
- Mac: `.app` bundle
- Linux: `.AppImage` or `.deb`

---

## Next Steps

1. ✅ Get Gemini API key
2. ✅ Run the app
3. ✅ Configure API key
4. ✅ Test AI features
5. 🎉 Start using it daily!

---

## Need Help?

- Check `README.md` for full documentation
- Check `STATUS.md` for implementation details
- Check `GEMINI_SETUP.md` for API key help

---

**Enjoy your AI-powered terminal!** 🚀✨

