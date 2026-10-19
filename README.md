# AI Marketing Agent V5.2 (Real AI)

Owner-controlled, approval-first marketing agent.  
**Not a fake demo UI** — when API keys are set, it fetches the public page and calls your AI provider for real strategy + drafts.

## What it does
1. **Link analysis** — fetches page text + AI marketing strategy
2. **Image upload** — optional vision models for creative ideas
3. **Drafts** — Facebook, Instagram, TikTok, Reddit, Pinterest
4. **Approval dashboard** — edit before anything could publish
5. **History** — draft / approved status (in-memory; add DB later)
6. **Ready for social APIs** — add tokens later for real posting

## Real AI setup (Groq — free, recommended)

1. Create key: https://console.groq.com → API Keys  
2. Set environment variables:

```bash
export AI_API_KEY=gsk_your_key_here
export AI_API_URL=https://api.groq.com/openai/v1/chat/completions
export AI_MODEL=llama-3.3-70b-versatile
```

Other OpenAI-compatible providers (OpenRouter, etc.) work the same way — change URL + model name.

### On Vercel
Project Settings → Environment Variables → add the three vars above → Redeploy.

## Local run
```bash
npm install
npm start
```
Open http://localhost:3000

Without keys the app still runs but shows **DEMO MODE** clearly.

## Image / vision
Text models (Groq Llama etc.) work best for **links**.  
For **image analysis**, use a vision-capable model/provider (e.g. Google Gemini or OpenRouter vision models) and the same `AI_*` env vars if the endpoint accepts `image_url` content parts.

## Social posting
Approve only marks status. Real publish needs official APIs + tokens such as:
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- Instagram / TikTok tokens when you integrate

Never commit secrets. Keep `LICENSE` + `OWNERSHIP.md`.

## Deploy GitHub + Vercel
1. Push this folder to GitHub  
2. Import on vercel.com  
3. Add `AI_API_KEY`, `AI_API_URL`, `AI_MODEL`  
4. Deploy  

## Update
Edit code → push GitHub → Vercel auto-redeploys.

## License
Proprietary — MD SAJID. See LICENSE.
