import { useState } from "react";
import { hasApiKey, callLLM } from "../../services/llmApi";
import { ghostBtn } from "../../components/styles";
import MarkdownField from "../../components/MarkdownField";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  buildMemoryBatchPrompt,
  parseMemoryEntries,
  batchChapters,
  makeMemory,
  MEMORY_CATEGORIES,
} from "../../lib/storyMemory";

// AI-generated, categorized "story bible" notes for a story. Steered by a free-form direction.
export default function StoryMemories({ settings, story, onAddMemory, onUpdateMemory, onRemoveMemory, onSetMemories }) {
  const [direction, setDirection] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress]   = useState("");
  const [error, setError]         = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const aiReady = hasApiKey(settings);
  const memories = story.memories || [];

  // Build the list of "chapters" to process: real chapters for serialized, or the
  // single content blob for one-shots.
  const sourceChapters = story.type === "serialized"
    ? story.chapters
    : (story.content && story.content.trim()
        ? [{ title: story.title, content: story.content }]
        : []);

  const handleGenerate = async () => {
    if (sourceChapters.length === 0) {
      setError("There's no story content to build memories from yet.");
      return;
    }
    setIsLoading(true);
    setError("");

    const batches = batchChapters(sourceChapters);
    let working = memories;

    try {
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Processing ${batches[i].label} (batch ${i + 1}/${batches.length})…`);
        const { systemPrompt, userMessage } = buildMemoryBatchPrompt({
          direction,
          existingMemories: working,
          batchChapters: batches[i].chapters,
          batchLabel: batches[i].label,
        });
        const result = await callLLM(settings, systemPrompt, userMessage, "tracker");
        const parsed = parseMemoryEntries(result);
        if (parsed.length > 0) working = parsed;
      }
      onSetMemories(working);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
      setProgress("");
    }
  };

  const handleAddManual = () => {
    onAddMemory(makeMemory("General", "", "manual"));
  };

  const handleClearAll = () => setConfirmClear(true);

  // Group entries by category, preserving a stable category order.
  const grouped = {};
  memories.forEach(m => {
    const cat = m.category || "General";
    (grouped[cat] = grouped[cat] || []).push(m);
  });
  const orderedCategories = [
    ...MEMORY_CATEGORIES.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !MEMORY_CATEGORIES.includes(c)),
  ];

  const labelSt = {
    fontSize: "10px", letterSpacing: "0.18em", color: "#5a5a72",
    textTransform: "uppercase", fontFamily: "'Georgia', serif", display: "block", marginBottom: "8px",
  };

  return (
    <div>
      <div style={{ fontSize: "13px", color: "#5a5a72", lineHeight: "1.65", marginBottom: "16px" }}>
        Generate categorized notes about this story — characters, plot threads, world, timeline — that
        you can attach to <span style={{ color: "#a0988a" }}>Story Forge</span> as an appendix when drafting the next part.
      </div>

      {/* Direction + generate */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelSt}>Direction — what should the memories focus on?</label>
        <textarea
          rows={3}
          value={direction}
          onChange={e => setDirection(e.target.value)}
          placeholder="e.g. Track each character's emotional arc and any unresolved mysteries or promises the plot has made."
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#0c0c14", border: "1.5px solid #2e2e3a",
            borderRadius: "6px", color: "#c8c0b0",
            padding: "12px 14px", fontSize: "13px",
            fontFamily: "'Georgia', serif", lineHeight: "1.7",
            resize: "vertical", outline: "none",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
        <button
          onClick={handleGenerate}
          disabled={!aiReady || isLoading}
          title={aiReady ? "" : "Add an API key in Settings to generate memories."}
          style={{
            background: (!aiReady || isLoading) ? "rgba(201,169,110,0.12)" : "linear-gradient(135deg, #b8923a 0%, #c9a96e 50%, #d4b87a 100%)",
            color: (!aiReady || isLoading) ? "#7a6a40" : "#1a1208",
            border: (!aiReady || isLoading) ? "1.5px solid #2e2e3a" : "none",
            borderRadius: "6px", padding: "10px 22px", fontSize: "12px",
            fontFamily: "'Georgia', serif", fontWeight: "bold",
            letterSpacing: "0.08em", textTransform: "uppercase",
            cursor: (!aiReady || isLoading) ? "default" : "pointer",
          }}
        >
          {isLoading ? "Generating…" : memories.length > 0 ? "✦ Regenerate / Extend" : "✦ Generate Memories"}
        </button>
        <button onClick={handleAddManual} style={ghostBtn}>+ Add Note</button>
        {memories.length > 0 && (
          <button onClick={handleClearAll} style={{ ...ghostBtn, color: "#8a5a5a", borderColor: "#4a2a2a" }}>Clear All</button>
        )}
      </div>

      {aiReady && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
          <span style={{ fontSize: "11px", color: "#4a6a4a", fontFamily: "'Georgia', serif", letterSpacing: "0.06em" }}>
            AI-powered via {settings.provider === "claude" ? "Claude" : "OpenAI"}
            {" · "}
            {settings.provider === "claude"
              ? (settings.claudeTrackerModel || settings.claudeModel)
              : (settings.openaiTrackerModel || settings.openaiModel)}
          </span>
        </div>
      )}

      {!aiReady && (
        <div style={{ fontSize: "12px", color: "#7a6a40", lineHeight: "1.6", marginBottom: "16px" }}>
          AI is required to generate memories. Add an API key in Settings — you can still add and edit notes manually below.
        </div>
      )}

      {progress && (
        <div style={{ fontSize: "12px", color: "#c9a96e", marginBottom: "16px", fontFamily: "'Georgia', serif" }}>{progress}</div>
      )}
      {error && (
        <div style={{ fontSize: "12px", color: "#f87171", marginBottom: "16px", lineHeight: "1.6" }}>{error}</div>
      )}

      {/* Entries */}
      {memories.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px", color: "#5a5a72", border: "1px dashed #2e2e3a", borderRadius: "8px", fontFamily: "'Georgia', serif", fontSize: "13px" }}>
          No memories yet. Generate them with AI, or add a note manually.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {orderedCategories.map(cat => (
            <div key={cat}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", color: "#c9a96e", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Georgia', serif" }}>
                  {cat}
                </span>
                <div style={{ flex: 1, height: "1px", background: "#1e1e2a" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {grouped[cat].map(m => (
                  <MemoryEntry
                    key={m.id}
                    memory={m}
                    onUpdate={(data) => onUpdateMemory(m.id, data)}
                    onRemove={() => onRemoveMemory(m.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear all memories?"
          message="This removes every memory note for this story. This cannot be undone."
          confirmLabel="Clear All"
          destructive
          onConfirm={() => { onSetMemories([]); setConfirmClear(false); }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

function MemoryEntry({ memory, onUpdate, onRemove }) {
  return (
    <div style={{ border: "1px solid #2e2e3a", borderRadius: "6px", padding: "12px 14px", background: "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
        <input
          type="text"
          value={memory.category || ""}
          onChange={e => onUpdate({ category: e.target.value })}
          placeholder="Category"
          style={{
            background: "transparent", border: "none", outline: "none",
            color: "#7a7a95", fontSize: "11px", letterSpacing: "0.08em",
            textTransform: "uppercase", fontFamily: "'Georgia', serif", width: "60%",
          }}
        />
        <button
          onClick={onRemove}
          title="Remove note"
          style={{
            background: "transparent", border: "none", color: "#5a5a72",
            cursor: "pointer", fontSize: "14px", lineHeight: 1, flexShrink: 0, padding: "2px 6px",
          }}
        >
          ✕
        </button>
      </div>
      <MarkdownField
        value={memory.content || ""}
        onChange={val => onUpdate({ content: val })}
        placeholder="Note…"
        rows={2}
        textareaStyle={{ fontSize: "13px", border: "1px solid #1e1e2a", padding: "9px 12px" }}
        style={{ fontSize: "13px", border: "1px solid #1e1e2a", padding: "9px 12px" }}
      />
    </div>
  );
}
