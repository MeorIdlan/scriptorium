const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const logger = require("../logger");
const FILE = path.join(__dirname, "..", "..", "data", "settings.json");

const DEFAULTS = {
  provider: "claude",
  claudeApiKey: "",
  claudeModel: "claude-opus-4-8",
  claudeForgeModel: "claude-opus-4-8",
  claudeModels: [],
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiForgeModel: "gpt-4o",
  openaiModels: [],
  generatorStreaming: true,
  generatorSystemPrompt: "",
  generatorMaxTokens: 4096,
  forgeMaxTokens: 4096,
  trackerMaxTokens: 4096,
  forgePanelSlide: true,
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Strip API keys from the object sent to the client
function sanitize(s) {
  return {
    provider:             s.provider,
    claudeKeySet:         !!s.claudeApiKey,
    claudeModel:          s.claudeModel,
    claudeForgeModel:     s.claudeForgeModel,
    claudeModels:         s.claudeModels || [],
    openaiKeySet:         !!s.openaiApiKey,
    openaiModel:          s.openaiModel,
    openaiForgeModel:     s.openaiForgeModel,
    openaiModels:         s.openaiModels || [],
    generatorStreaming:    s.generatorStreaming,
    generatorSystemPrompt: s.generatorSystemPrompt,
    generatorMaxTokens:   s.generatorMaxTokens ?? 4096,
    forgeMaxTokens:       s.forgeMaxTokens ?? 4096,
    trackerMaxTokens:     s.trackerMaxTokens ?? 4096,
    forgePanelSlide:      s.forgePanelSlide ?? true,
  };
}

// GET /api/settings
router.get("/", (_req, res) => {
  res.json(sanitize(read()));
});

// PATCH /api/settings  — update non-secret fields
router.patch("/", (req, res) => {
  const current = read();
  const allowed = [
    "provider", "claudeModel", "claudeForgeModel",
    "openaiModel", "openaiForgeModel",
    "generatorStreaming", "generatorSystemPrompt",
    "generatorMaxTokens", "forgeMaxTokens", "trackerMaxTokens",
    "forgePanelSlide",
  ];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  const next = { ...current, ...updates };
  write(next);
  res.json(sanitize(next));
});

const OPENAI_CHAT_PRIORITY = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"];

async function fetchClaudeModels(key) {
  logger.info("API", "GET https://api.anthropic.com/v1/models | provider=claude");
  const r = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || "Invalid API key"), { status: 400 });
  }
  const data = await r.json();
  const list = (data.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }));
  if (list.length === 0) throw Object.assign(new Error("No models returned from Anthropic"), { status: 400 });
  return list;
}

async function fetchOpenAIModels(key) {
  logger.info("API", "GET https://api.openai.com/v1/models | provider=openai");
  const r = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || "Invalid API key"), { status: 400 });
  }
  const data = await r.json();
  const list = (data.data || [])
    .filter(m => (m.id.startsWith("gpt-") || /^o[0-9]/.test(m.id)) && !m.id.includes(":"))
    .sort((a, b) => {
      const ai = OPENAI_CHAT_PRIORITY.indexOf(a.id);
      const bi = OPENAI_CHAT_PRIORITY.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (b.created || 0) - (a.created || 0);
    })
    .map(m => ({ id: m.id, label: m.id }));
  if (list.length === 0) throw Object.assign(new Error("No models returned from OpenAI"), { status: 400 });
  return list;
}

// GET /api/settings/models/:provider  — fetch live models using stored key
router.get("/models/:provider", async (req, res) => {
  const { provider } = req.params;
  const current = read();
  try {
    let models;
    if (provider === "claude") {
      if (!current.claudeApiKey) return res.status(400).json({ error: "No Claude API key configured" });
      models = await fetchClaudeModels(current.claudeApiKey);
      current.claudeModels = models;
    } else if (provider === "openai") {
      if (!current.openaiApiKey) return res.status(400).json({ error: "No OpenAI API key configured" });
      models = await fetchOpenAIModels(current.openaiApiKey);
      current.openaiModels = models;
    } else {
      return res.status(400).json({ error: "Unknown provider" });
    }
    write(current);
    res.json({ models });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/settings/api-key  — { provider, key } — validate + store
router.post("/api-key", async (req, res) => {
  const { provider, key } = req.body;
  if (!provider || !key) return res.status(400).json({ error: "provider and key required" });

  logger.info("API", `POST /api/settings/api-key | provider=${provider} validating key`);
  try {
    let models;
    if (provider === "claude") {
      models = await fetchClaudeModels(key);
    } else if (provider === "openai") {
      models = await fetchOpenAIModels(key);
    } else {
      return res.status(400).json({ error: "Unknown provider" });
    }

    const current = read();
    if (provider === "claude") { current.claudeApiKey = key; current.claudeModels = models; }
    else { current.openaiApiKey = key; current.openaiModels = models; }
    write(current);

    res.json({ models, settings: sanitize(current) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/settings/api-key/:provider
router.delete("/api-key/:provider", (req, res) => {
  const { provider } = req.params;
  const current = read();
  if (provider === "claude") current.claudeApiKey = "";
  else if (provider === "openai") current.openaiApiKey = "";
  else return res.status(400).json({ error: "Unknown provider" });
  write(current);
  res.json(sanitize(current));
});

module.exports = router;
