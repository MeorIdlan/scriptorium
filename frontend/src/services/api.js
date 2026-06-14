async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Settings ──────────────────────────────────────────────────────────────

export const getSettings = () => request("/api/settings");

export const updateSettings = (data) =>
  request("/api/settings", { method: "PATCH", body: data });

export const setApiKey = (provider, key) =>
  request("/api/settings/api-key", { method: "POST", body: { provider, key } });

export const getModels = (provider) =>
  request(`/api/settings/models/${provider}`);

export const removeApiKey = (provider) =>
  request(`/api/settings/api-key/${provider}`, { method: "DELETE" });

// ── Stories ───────────────────────────────────────────────────────────────

export const getStories = () => request("/api/stories");

export const createStory = (data) =>
  request("/api/stories", { method: "POST", body: data });

export const updateStory = (id, data) =>
  request(`/api/stories/${id}`, { method: "PATCH", body: data });

export const deleteStory = (id) =>
  request(`/api/stories/${id}`, { method: "DELETE" });

export const updateStoryContent = (id, content) =>
  request(`/api/stories/${id}/content`, { method: "PATCH", body: { content } });

export const createChapter = (storyId, data) =>
  request(`/api/stories/${storyId}/chapters`, { method: "POST", body: data });

export const updateChapter = (storyId, chapterId, data) =>
  request(`/api/stories/${storyId}/chapters/${chapterId}`, { method: "PATCH", body: data });

export const deleteChapter = (storyId, chapterId) =>
  request(`/api/stories/${storyId}/chapters/${chapterId}`, { method: "DELETE" });

export const updateChapterContent = (storyId, chapterId, content) =>
  request(`/api/stories/${storyId}/chapters/${chapterId}/content`, { method: "PATCH", body: { content } });

export const addMemory = (storyId, data) =>
  request(`/api/stories/${storyId}/memories`, { method: "POST", body: data });

export const updateMemory = (storyId, memoryId, data) =>
  request(`/api/stories/${storyId}/memories/${memoryId}`, { method: "PATCH", body: data });

export const deleteMemory = (storyId, memoryId) =>
  request(`/api/stories/${storyId}/memories/${memoryId}`, { method: "DELETE" });

export const setMemories = (storyId, memories) =>
  request(`/api/stories/${storyId}/memories`, { method: "PUT", body: memories });

// ── Presets ───────────────────────────────────────────────────────────────

export const getPresets = () => request("/api/presets");

export const createPreset = (data) =>
  request("/api/presets", { method: "POST", body: data });

export const deletePreset = (id) =>
  request(`/api/presets/${id}`, { method: "DELETE" });

// ── LLM Generation ────────────────────────────────────────────────────────

export async function callLLM(systemPrompt, userMessage, mode = "generator", assistantPrefill) {
  const data = await request("/api/generate", {
    method: "POST",
    body: { systemPrompt, userMessage, mode, assistantPrefill },
  });
  return data.text;
}

export async function callLLMStreaming(systemPrompt, userMessage, mode = "generator", onChunk, signal, assistantPrefill) {
  const res = await fetch("/api/generate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userMessage, mode, assistantPrefill }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Stream request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const event = JSON.parse(payload);
        if (event.error) throw new Error(event.error);
        if (event.text) onChunk(event.text);
      } catch (err) {
        if (err.message && !err.message.startsWith("JSON")) throw err;
      }
    }
  }
}
