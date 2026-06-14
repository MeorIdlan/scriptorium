import { callLLM as _callLLM, callLLMStreaming as _callLLMStreaming } from "./api";

export function hasApiKey(settings) {
  return (settings.provider === "claude" && !!settings.claudeKeySet) ||
         (settings.provider === "openai" && !!settings.openaiKeySet);
}

// mode: "generator" | "forge"
export function callLLM(settings, systemPrompt, userMessage, mode = "generator", assistantPrefill) {
  return _callLLM(systemPrompt, userMessage, mode, assistantPrefill);
}

export function callLLMStreaming(settings, systemPrompt, userMessage, onChunk, signal, mode = "generator", assistantPrefill) {
  return _callLLMStreaming(systemPrompt, userMessage, mode, onChunk, signal, assistantPrefill);
}
