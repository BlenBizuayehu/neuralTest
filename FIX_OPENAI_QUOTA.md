# How to Fix OpenAI Quota Error

## The Problem
You're getting: `"insufficient_quota"` - This means your OpenAI account has no credits/billing set up.

## Solution: Add Credits to OpenAI

### Step 1: Go to OpenAI Billing
1. Visit: https://platform.openai.com/account/billing
2. Sign in to your OpenAI account

### Step 2: Add Payment Method
1. Click **"Add payment method"** or **"Set up paid account"**
2. Add a credit card or payment method
3. OpenAI requires a minimum $5 deposit to start using the API

### Step 3: Set Usage Limits (Optional but Recommended)
1. Go to: https://platform.openai.com/account/billing/limits
2. Set a **hard limit** (e.g., $10/month) to prevent unexpected charges
3. Set a **soft limit** for warnings

### Step 4: Verify It Works
1. Check your usage: https://platform.openai.com/usage
2. You should see credits available
3. Try the AI feature again in Project Neural

## Alternative: Use a Different API Key

If you have another OpenAI account with credits:
1. Get a new API key from that account
2. In Project Neural, click "✨ AI" button
3. Enter the new API key
4. Click "Save"

## Cost Information

- **GPT-4o-mini** (default): ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- Typical command generation: **$0.001-0.01 per request**
- Example: 1000 AI requests ≈ $1-10 (depending on complexity)

## Free Alternatives (Future Feature)

We could add support for:
- **Ollama** (local, free, no API key needed)
- **LM Studio** (local, free)
- **Anthropic Claude** (separate API key)

Would you like me to add local LLM support so you don't need OpenAI credits?

## Quick Check

After adding credits, verify:
1. Go to: https://platform.openai.com/account/billing
2. You should see: "Available credits: $X.XX"
3. If it shows $0.00, you need to add more credits

## Still Having Issues?

1. **Check API key is correct**: Should start with `sk-`
2. **Check account status**: https://platform.openai.com/account
3. **Check billing**: https://platform.openai.com/account/billing
4. **Contact OpenAI support**: If credits are added but still not working

