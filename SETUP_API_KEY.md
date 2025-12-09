# How to Set Up OpenAI API Key

## Step 1: Get Your API Key

1. Visit: https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click **"Create new secret key"**
4. Give it a name (e.g., "Project Neural")
5. **Copy the key immediately** - you won't see it again!

## Step 2: Add API Key to Project Neural

### Method 1: In the App (Recommended)
1. Open Project Neural
2. Click the **"✨ AI"** button in the header (or press `Ctrl+Shift+P`)
3. You'll see an API key setup prompt
4. Paste your API key
5. Click **"Save"**

### Method 2: Environment Variable (Windows PowerShell)
```powershell
# Set for current session
$env:OPENAI_API_KEY = "sk-your-api-key-here"

# Set permanently (requires restart)
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-your-api-key-here", "User")
```

### Method 3: Environment Variable (Windows CMD)
```cmd
# Set for current session
set OPENAI_API_KEY=sk-your-api-key-here

# Set permanently
setx OPENAI_API_KEY "sk-your-api-key-here"
```

### Method 4: Environment Variable (Linux/Mac)
```bash
# Set for current session
export OPENAI_API_KEY="sk-your-api-key-here"

# Set permanently (add to ~/.bashrc or ~/.zshrc)
echo 'export OPENAI_API_KEY="sk-your-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

## Step 3: Verify It Works

1. Open the AI panel (`Ctrl+Shift+P`)
2. Type: "list all files in current directory"
3. If it generates a command, your API key is working! ✅

## Troubleshooting

### "API key not configured" error
- Make sure you've set the key using one of the methods above
- Restart the app after setting environment variable
- Check the key starts with `sk-`

### "OpenAI API error" messages
- Verify your API key is correct
- Check you have credits in your OpenAI account
- Ensure you have internet connection
- Check OpenAI status: https://status.openai.com

### API Key Format
- Should start with `sk-`
- Usually 51+ characters long
- Example: `sk-proj-abc123...xyz789`

## Cost Information

OpenAI charges per API call:
- **GPT-4o-mini** (default): ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- **GPT-4**: More expensive but more capable
- Typical command generation: ~$0.001-0.01 per request

You can set usage limits at: https://platform.openai.com/account/billing/limits

## Security Notes

⚠️ **Important:**
- Never share your API key publicly
- Don't commit it to git
- The app automatically redacts secrets before sending to AI
- Your key is stored locally in SQLite (encrypted by OS)

## Need Help?

- OpenAI Docs: https://platform.openai.com/docs
- Check API status: https://status.openai.com
- View usage: https://platform.openai.com/usage

