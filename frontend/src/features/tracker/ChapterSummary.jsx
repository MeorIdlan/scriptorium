import { useState } from "react";
import { hasApiKey, callLLM } from "../../services/llmApi";
import { buildChapterSummaryPrompt, buildChapterSummaryCopyText } from "../../lib/storyMemory";
import MarkdownField from "../../components/MarkdownField";

// Per-chapter summary: editable field, AI generation, and a copyable prompt for the no-AI path.
export default function ChapterSummary({ settings, chapter, chapterNumber, priorSummaries, onChange }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState("");
  const [copied, setCopied]       = useState(false);

  const aiReady = hasApiKey(settings);

  const handleGenerate = async () => {
    if (!chapter.content || !chapter.content.trim()) {
      setError("This chapter has no content to summarize yet.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const { systemPrompt, userMessage } = buildChapterSummaryPrompt({ chapter, chapterNumber, priorSummaries });
      const result = await callLLM(settings, systemPrompt, userMessage, "tracker");
      onChange(result.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPrompt = () => {
    const text = buildChapterSummaryCopyText({ chapter, chapterNumber, priorSummaries });
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const labelSt = {
    fontSize: "10px", letterSpacing: "0.18em", color: "#c9a96e",
    textTransform: "uppercase", fontFamily: "'Georgia', serif", fontWeight: "bold",
  };

  const smallBtn = {
    background: "transparent", border: "1.5px solid #2e2e3a", borderRadius: "4px",
    color: "#7a7a95", padding: "6px 14px", fontSize: "11px",
    letterSpacing: "0.08em", textTransform: "uppercase",
    cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s",
  };

  const placeholder = aiReady
    ? "Generate a summary above, or write your own. This can be attached to Story Forge when drafting the next chapter."
    : 'Write a summary, or click "Copy Summary Prompt" to generate one in any external AI, then paste it back here.';

  return (
    <div style={{ marginTop: "20px", border: "1px solid #1e1e2a", borderRadius: "8px", padding: "18px 20px", background: "rgba(255,255,255,0.015)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={labelSt}>Chapter Summary</span>
          <span style={{ fontSize: "11px", color: "#5a5a72" }}>continuity context for the next chapter</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {aiReady && (
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              style={{
                ...smallBtn,
                borderColor: "rgba(201,169,110,0.4)",
                color: isLoading ? "#5a5a72" : "#c9a96e",
                background: "rgba(201,169,110,0.08)",
                cursor: isLoading ? "default" : "pointer",
              }}
            >
              {isLoading ? "Generating…" : "✦ Generate Summary"}
            </button>
          )}
          <button onClick={handleCopyPrompt} style={{ ...smallBtn, color: copied ? "#c9a96e" : "#7a7a95" }}>
            {copied ? "✓ Copied!" : "Copy Summary Prompt"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: "12px", color: "#f87171", marginBottom: "10px", lineHeight: "1.5" }}>{error}</div>
      )}

      <MarkdownField
        value={chapter.summary || ""}
        onChange={onChange}
        rows={4}
        placeholder={placeholder}
        textareaStyle={{ fontSize: "13px" }}
        style={{ fontSize: "13px" }}
      />
    </div>
  );
}
