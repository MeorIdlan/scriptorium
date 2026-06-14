const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const logger = require("../logger");
const SETTINGS_FILE = path.join(__dirname, "..", "..", "data", "settings.json");

const SETTINGS_DEFAULTS = {
  provider: "claude",
  claudeApiKey: "",
  claudeModel: "claude-opus-4-8",
  claudeForgeModel: "claude-opus-4-8",
  claudeTrackerModel: "claude-opus-4-8",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiForgeModel: "gpt-4o",
  openaiTrackerModel: "gpt-4o",
  generatorMaxTokens: 4096,
  forgeMaxTokens: 4096,
  trackerMaxTokens: 4096,
};

function readSettings() {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function resolveMaxTokens(settings, mode) {
  if (mode === "forge") return settings.forgeMaxTokens ?? 4096;
  if (mode === "tracker") return settings.trackerMaxTokens ?? 4096;
  return settings.generatorMaxTokens ?? 4096;
}

function resolveModel(settings, mode) {
  if (settings.provider === "claude") {
    if (mode === "forge") return settings.claudeForgeModel || "claude-opus-4-8";
    if (mode === "tracker") return settings.claudeTrackerModel || "claude-opus-4-8";
    return settings.claudeModel || "claude-opus-4-8";
  }
  if (mode === "forge") return settings.openaiForgeModel || "gpt-4o";
  if (mode === "tracker") return settings.openaiTrackerModel || "gpt-4o";
  return settings.openaiModel || "gpt-4o";
}

// POST /api/generate  — non-streaming
router.post("/", async (req, res) => {
  const { systemPrompt, userMessage = "", mode = "generator", assistantPrefill } = req.body;
  if (!systemPrompt) return res.status(400).json({ error: "systemPrompt required" });

  const settings = readSettings();
  const messageContent = userMessage.trim() || ".";
  const CONTINUE_INSTRUCTION = "[Continue your last message without repeating its original content.]";

  try {
    let text;
    if (settings.provider === "claude") {
      if (!settings.claudeApiKey) return res.status(400).json({ error: "Claude API key not configured" });
      const model = resolveModel(settings, mode);
      const messages = assistantPrefill
        ? [{ role: "user", content: "." }, { role: "assistant", content: assistantPrefill }, { role: "user", content: CONTINUE_INSTRUCTION }]
        : [{ role: "user", content: messageContent }];
      const body = {
        model,
        max_tokens: resolveMaxTokens(settings, mode),
        system: systemPrompt,
        messages,
      };
      logger.info("LLM", `POST https://api.anthropic.com/v1/messages\n${JSON.stringify(body, null, 2)}`);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.claudeApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.error?.message || `Claude API error: ${r.status}` });
      }
      const data = await r.json();
      text = data.content[0].text;
    } else {
      if (!settings.openaiApiKey) return res.status(400).json({ error: "OpenAI API key not configured" });
      const model = resolveModel(settings, mode);
      const openaiMessages = assistantPrefill
        ? [{ role: "system", content: systemPrompt }, { role: "user", content: "." }, { role: "assistant", content: assistantPrefill }, { role: "system", content: CONTINUE_INSTRUCTION }]
        : [{ role: "system", content: systemPrompt }, { role: "user", content: messageContent }];
      const body = {
        model,
        max_tokens: resolveMaxTokens(settings, mode),
        messages: openaiMessages,
      };
      logger.info("LLM", `POST https://api.openai.com/v1/chat/completions\n${JSON.stringify(body, null, 2)}`);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.openaiApiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.error?.message || `OpenAI API error: ${r.status}` });
      }
      const data = await r.json();
      text = data.choices[0].message.content;
    }

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate/stream  — SSE streaming proxy
router.post("/stream", async (req, res) => {
  const { systemPrompt, userMessage = "", mode = "generator", assistantPrefill } = req.body;
  if (!systemPrompt) return res.status(400).json({ error: "systemPrompt required" });

  const settings = readSettings();
  const messageContent = userMessage.trim() || ".";
  const CONTINUE_INSTRUCTION = "[Continue your last message without repeating its original content.]";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendChunk = (text) => {
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  };
  const sendDone = () => {
    res.write("data: [DONE]\n\n");
    res.end();
  };
  const sendError = (msg) => {
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  };

  try {
    if (settings.provider === "claude") {
      if (!settings.claudeApiKey) return sendError("Claude API key not configured");
      const model = resolveModel(settings, mode);
      const messages = assistantPrefill
        ? [{ role: "user", content: "." }, { role: "assistant", content: assistantPrefill }, { role: "user", content: CONTINUE_INSTRUCTION }]
        : [{ role: "user", content: messageContent }];
      const body = {
        model,
        max_tokens: resolveMaxTokens(settings, mode),
        stream: true,
        system: systemPrompt,
        messages,
      };
      logger.info("LLM", `POST https://api.anthropic.com/v1/messages\n${JSON.stringify(body, null, 2)}`);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.claudeApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return sendError(err.error?.message || `Claude API error: ${r.status}`);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      req.on("close", () => reader.cancel());

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              sendChunk(event.delta.text);
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } else {
      if (!settings.openaiApiKey) return sendError("OpenAI API key not configured");
      const model = resolveModel(settings, mode);
      const openaiMessages = assistantPrefill
        ? [{ role: "system", content: systemPrompt }, { role: "user", content: "." }, { role: "assistant", content: assistantPrefill }, { role: "system", content: CONTINUE_INSTRUCTION }]
        : [{ role: "system", content: systemPrompt }, { role: "user", content: messageContent }];
      const body = {
        model,
        stream: true,
        max_tokens: resolveMaxTokens(settings, mode),
        messages: openaiMessages,
      };
      logger.info("LLM", `POST https://api.openai.com/v1/chat/completions\n${JSON.stringify(body, null, 2)}`);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.openaiApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return sendError(err.error?.message || `OpenAI API error: ${r.status}`);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      req.on("close", () => reader.cancel());

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const event = JSON.parse(json);
            const text = event.choices?.[0]?.delta?.content;
            if (text) sendChunk(text);
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    }

    sendDone();
  } catch (err) {
    if (err.name !== "AbortError") sendError(err.message);
    else res.end();
  }
});

module.exports = router;
