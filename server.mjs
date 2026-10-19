import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

// In-memory history (replace with DB / Vercel KV for production scale)
let history = [];

function hasAIConfig() {
  return Boolean(process.env.AI_API_KEY && process.env.AI_API_URL && process.env.AI_MODEL);
}

function safeUrl(value) {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) {
      throw new Error("Only HTTP(S) URLs are allowed.");
    }
    return u.toString();
  } catch {
    throw new Error("Please enter a valid http(s) URL.");
  }
}

/** Fetch public page text for real analysis (best-effort). */
async function fetchPageText(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AI-Marketing-Agent/5.2 (+https://localhost; public page analyzer)",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    clearTimeout(timer);
    if (!res.ok) return `Could not fetch page content (status ${res.status}).`;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return text || "Page returned little readable text.";
  } catch (err) {
    return `Page fetch failed: ${err.message}. Analyze from URL only.`;
  }
}

function buildPrompt({ url, pageText, isImage }) {
  if (isImage) {
    return `You are an expert ethical marketing strategist and copywriter.
An image was uploaded for a marketing campaign. Analyze the visual (product, mood, audience cues) and create practical content.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2-3 sentence marketing insight",
  "audience": "who this is for",
  "goal": "primary campaign goal",
  "strategy": ["point1", "point2", "point3"],
  "drafts": {
    "facebook": {
      "hooks": ["hook1", "hook2", "hook3"],
      "caption": "full caption",
      "cta": "short CTA",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7"]
    },
    "instagram": {
      "caption": "instagram caption",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
    },
    "tiktok": {
      "caption": "short tiktok caption",
      "hashtags": ["#fyp", "#tag2", "#tag3", "#tag4", "#tag5"]
    },
    "reddit": {
      "title": "reddit post title",
      "body": "reddit body text",
      "note": "reminder about subreddit rules"
    },
    "pinterest": {
      "title": "pin title",
      "description": "pin description",
      "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]
    }
  }
}

Rules: useful, non-spammy, no invented brand claims, approval-first (never say published).`;
  }

  return `You are an expert ethical marketing strategist and copywriter.
Analyze this public page and create platform-ready marketing drafts.

URL: ${url}

Page text extract (may be partial):
"""
${pageText}
"""

Return ONLY valid JSON with this exact shape:
{
  "summary": "2-3 sentence marketing insight based on the page",
  "audience": "who this product/service is for",
  "goal": "primary campaign goal",
  "strategy": ["point1", "point2", "point3"],
  "drafts": {
    "facebook": {
      "hooks": ["hook1", "hook2", "hook3"],
      "caption": "full caption including benefit + URL if useful",
      "cta": "short CTA",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7"]
    },
    "instagram": {
      "caption": "instagram caption",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
    },
    "tiktok": {
      "caption": "short tiktok caption",
      "hashtags": ["#fyp", "#tag2", "#tag3", "#tag4", "#tag5"]
    },
    "reddit": {
      "title": "reddit post title",
      "body": "helpful non-spam body with link",
      "note": "reminder about subreddit rules and disclosure"
    },
    "pinterest": {
      "title": "pin title",
      "description": "pin description with link if useful",
      "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]
    }
  }
}

Rules:
- Use only facts supported by the page text / URL. Do not invent features.
- Keep tone useful and non-spammy.
- Platform-appropriate length.
- Never claim anything was published (approval-first system).`;
}

async function callAI({ prompt, imageBase64 }) {
  const key = process.env.AI_API_KEY;
  const endpoint = process.env.AI_API_URL;
  const model = process.env.AI_MODEL;

  const userContent = imageBase64
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ]
    : prompt;

  const body = {
    model,
    messages: [
      { role: "system", content: "You are a marketing AI. Return valid JSON only. No markdown fences." },
      { role: "user", content: userContent }
    ],
    temperature: 0.65
  };

  // Some providers (Groq, OpenRouter) accept response_format; ignore if rejected
  if (!imageBase64) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`AI provider error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  let content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content.");

  content = String(content)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(content);
}

function normalizeResult(parsed, { url, isImage }) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return {
    id,
    source: isImage ? "image" : "url",
    url: isImage ? null : url,
    brand: parsed.brand || (isImage ? "Image Campaign" : (url ? new URL(url).hostname.replace(/^www\./, "").split(".")[0] : "Campaign")),
    summary: parsed.summary || "",
    audience: parsed.audience || "",
    goal: parsed.goal || "",
    strategy: Array.isArray(parsed.strategy) ? parsed.strategy : [],
    drafts: parsed.drafts || {},
    status: "draft",
    createdAt: new Date().toISOString(),
    mode: "ai"
  };
}

/** Fallback only if AI is not configured — clearly marked demo. */
function demoResult(urlOrDesc, isImage = false) {
  const label = isImage
    ? "uploaded image"
    : urlOrDesc
      ? new URL(urlOrDesc).hostname.replace(/^www\./, "")
      : "your content";
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    source: isImage ? "image" : "url",
    url: isImage ? null : urlOrDesc,
    brand: isImage ? "Image Campaign" : label.split(".")[0],
    summary: `DEMO MODE: No AI_API_KEY configured. Sample strategy for ${label}. Set AI_API_KEY, AI_API_URL, AI_MODEL for real AI.`,
    audience: "People interested in this product or topic.",
    goal: "Increase awareness and clicks.",
    strategy: [
      "Lead with a clear customer benefit.",
      "Use platform-specific formats.",
      "One clear call-to-action."
    ],
    drafts: {
      facebook: {
        hooks: ["Looking for a better option?", "Simple idea worth trying.", "Check this out."],
        caption: isImage
          ? "Sample caption for your image (demo)."
          : `Sample caption for ${label}. ${urlOrDesc}`,
        cta: "Learn more",
        hashtags: ["#Marketing", "#Business", "#Tips", "#Growth", "#Online", "#Digital", "#Promo"]
      },
      instagram: {
        caption: "Demo Instagram caption.",
        hashtags: ["#marketing", "#business", "#content", "#growth", "#tips"]
      },
      tiktok: {
        caption: "Demo TikTok idea #fyp",
        hashtags: ["#fyp", "#marketing", "#business", "#tips", "#viral"]
      },
      reddit: {
        title: `Resource: ${label}`,
        body: isImage ? "Demo reddit body for image." : `Demo body.\n\n${urlOrDesc}`,
        note: "Follow subreddit rules."
      },
      pinterest: {
        title: `${label} idea`,
        description: "Demo pin description.",
        keywords: ["tips", "business", "guide", "idea", "marketing"]
      }
    },
    status: "draft",
    createdAt: new Date().toISOString(),
    mode: "demo"
  };
}

async function aiGenerate({ url, isImage, imageBase64 }) {
  if (!hasAIConfig()) {
    return demoResult(url, isImage);
  }

  let pageText = "";
  if (!isImage && url) {
    pageText = await fetchPageText(url);
  }

  const prompt = buildPrompt({ url, pageText, isImage });
  const parsed = await callAI({ prompt, imageBase64: isImage ? imageBase64 : null });
  return normalizeResult(parsed, { url, isImage });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    version: "5.2.0",
    approvalFirst: true,
    aiConfigured: hasAIConfig(),
    mode: hasAIConfig() ? "ai" : "demo"
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const url = safeUrl(req.body?.url || "");
    const result = await aiGenerate({ url, isImage: false });
    history.unshift(result);
    if (history.length > 80) history = history.slice(0, 80);
    res.json({
      ok: true,
      result,
      mode: result.mode,
      aiConfigured: hasAIConfig()
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "Analyze failed." });
  }
});

app.post("/api/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) throw new Error("No image uploaded.");
    const base64 = req.file.buffer.toString("base64");
    const result = await aiGenerate({ url: null, isImage: true, imageBase64: base64 });
    history.unshift(result);
    if (history.length > 80) history = history.slice(0, 80);
    res.json({
      ok: true,
      result,
      mode: result.mode,
      aiConfigured: hasAIConfig()
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "Image analysis failed." });
  }
});

app.get("/api/history", (_req, res) => {
  res.json({ ok: true, history: history.slice(0, 50) });
});

app.post("/api/approve/:id", (req, res) => {
  const item = history.find((h) => h.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  item.status = "approved";
  // Social publish hooks go here when you add FACEBOOK_PAGE_TOKEN etc.
  res.json({
    ok: true,
    message: "Approved. Social APIs not connected yet — content stays local until you add tokens."
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`AI Marketing Agent V5.2 on port ${PORT}`);
  console.log(`Mode: ${hasAIConfig() ? "REAL AI" : "DEMO (set AI_API_KEY, AI_API_URL, AI_MODEL)"}`);
});
