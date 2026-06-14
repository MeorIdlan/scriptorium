import { useState } from "react";
import Section from "../../components/Section";
import { ghostBtn } from "../../components/styles";
import { exportStoryMarkdown, exportStoryText } from "../../lib/utils";
import { StatusBadge, ChapterStatusBadge } from "./StatusBadge";
import DraftEditor from "./DraftEditor";
import ChapterSummary from "./ChapterSummary";
import StoryMemories from "./StoryMemories";

export default function StoryDetail({
  story, chapterIdx, setChapterIdx, settings,
  onEdit, onDelete, onAddChapter, onEditChapter, onDeleteChapter, onReorderChapters,
  onUpdateStoryContent, onUpdateChapterContent, onUpdateChapterSummary,
  onAddMemory, onUpdateMemory, onRemoveMemory, onSetMemories,
}) {
  const [exportOpen, setExportOpen] = useState(false);

  const progress = story.wordCountTarget > 0
    ? Math.min(100, Math.round((story.wordCountCurrent / story.wordCountTarget) * 100))
    : null;

  const safeIdx = Math.min(chapterIdx, Math.max(0, story.chapters.length - 1));
  const chapter = story.chapters[safeIdx];

  const moveChapter = (from, to) => {
    if (to < 0 || to >= story.chapters.length) return;
    const next = [...story.chapters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderChapters(next);
    setChapterIdx(to);
  };

  const primaryBtn = {
    background: "linear-gradient(135deg, #b8923a 0%, #c9a96e 50%, #d4b87a 100%)",
    color: "#1a1208", border: "none", borderRadius: "6px",
    padding: "8px 20px", fontSize: "12px",
    fontFamily: "'Georgia', serif", fontWeight: "bold",
    letterSpacing: "0.08em", cursor: "pointer",
    textTransform: "uppercase", transition: "all 0.3s",
  };

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "26px", fontWeight: "normal", color: "#e8e0d0", fontFamily: "'Georgia', serif" }}>
            {story.title}
          </h2>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0, marginLeft: "16px" }}>
            <div style={{ position: "relative" }}>
              <button onClick={() => setExportOpen(o => !o)} style={ghostBtn}>Export ▾</button>
              {exportOpen && (
                <>
                  <div
                    onClick={() => setExportOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  />
                  <div style={{
                    position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 11,
                    background: "#12121e", border: "1px solid #2e2e3a", borderRadius: "6px",
                    padding: "6px", minWidth: "150px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}>
                    {[
                      { label: "Markdown (.md)", fn: () => exportStoryMarkdown(story) },
                      { label: "Plain text (.txt)", fn: () => exportStoryText(story) },
                    ].map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => { opt.fn(); setExportOpen(false); }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          background: "transparent", border: "none", borderRadius: "4px",
                          color: "#c8c0b0", padding: "8px 12px", fontSize: "12px",
                          fontFamily: "'Georgia', serif", cursor: "pointer",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,169,110,0.1)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={onEdit} style={ghostBtn}>Edit</button>
            <button onClick={onDelete} style={{ ...ghostBtn, color: "#8a5a5a", borderColor: "#4a2a2a" }}>Delete</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginBottom: "14px" }}>
          <StatusBadge status={story.status} />
          <span style={{ fontSize: "12px", color: "#5a5a72" }}>
            {story.type === "serialized"
              ? `Serialized · ${story.chapters.length} chapter${story.chapters.length !== 1 ? "s" : ""}`
              : "One-Shot"}
          </span>
          {story.genres.map(g => (
            <span key={g} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "3px", border: "1px solid #2e2e3a", color: "#7a7a95" }}>{g}</span>
          ))}
        </div>

        {progress !== null && (
          <div style={{ marginBottom: "14px" }}>
            <div style={{ height: "4px", background: "#1e1e2a", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #b8923a, #c9a96e)", borderRadius: "2px" }} />
            </div>
            <div style={{ fontSize: "12px", color: "#7a7a95", marginTop: "6px" }}>
              {story.wordCountCurrent.toLocaleString()} / {story.wordCountTarget.toLocaleString()} words · {progress}%
            </div>
          </div>
        )}

        {story.synopsis && (
          <p style={{ margin: 0, fontSize: "14px", color: "#a0988a", lineHeight: "1.75", fontStyle: "italic", fontFamily: "'Georgia', serif" }}>
            {story.synopsis}
          </p>
        )}
      </div>

      {story.type === "oneshot" && (
        <Section title="Story Draft">
          <DraftEditor
            value={story.content}
            onChange={onUpdateStoryContent}
            placeholder="Write your story here. Changes are saved automatically."
          />
        </Section>
      )}

      {story.type === "serialized" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ color: "#c9a96e", fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: "bold", fontFamily: "'Georgia', serif" }}>
                Chapters
              </span>
              <div style={{ height: "1px", background: "#2e2e3a", width: "60px" }} />
            </div>
            <button onClick={onAddChapter} style={primaryBtn}>+ Add Chapter</button>
          </div>

          {story.chapters.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#5a5a72", border: "1px dashed #2e2e3a", borderRadius: "8px", fontFamily: "'Georgia', serif", fontSize: "13px" }}>
              No chapters added yet.
            </div>
          ) : (
            <>
              {/* Jump-list — click any chapter to jump directly */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                {story.chapters.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setChapterIdx(i)}
                    title={c.title || `Chapter ${i + 1}`}
                    style={{
                      minWidth: "32px", padding: "5px 9px", borderRadius: "4px", cursor: "pointer",
                      border: i === safeIdx ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
                      background: i === safeIdx ? "rgba(201,169,110,0.15)" : "rgba(255,255,255,0.03)",
                      color: i === safeIdx ? "#c9a96e" : "#8a8aa5",
                      fontSize: "12px", fontFamily: "'Georgia', serif", transition: "all 0.15s",
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "16px", justifyContent: "center" }}>
                <button
                  onClick={() => setChapterIdx(i => Math.max(0, i - 1))}
                  disabled={safeIdx === 0}
                  style={{ ...ghostBtn, opacity: safeIdx === 0 ? 0.35 : 1, cursor: safeIdx === 0 ? "default" : "pointer" }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: "13px", color: "#7a7a95", fontFamily: "'Georgia', serif", minWidth: "110px", textAlign: "center" }}>
                  Chapter {safeIdx + 1} / {story.chapters.length}
                </span>
                <button
                  onClick={() => setChapterIdx(i => Math.min(story.chapters.length - 1, i + 1))}
                  disabled={safeIdx === story.chapters.length - 1}
                  style={{ ...ghostBtn, opacity: safeIdx === story.chapters.length - 1 ? 0.35 : 1, cursor: safeIdx === story.chapters.length - 1 ? "default" : "pointer" }}
                >
                  Next →
                </button>
              </div>

              {chapter && (
                <div>
                  <div style={{ border: "1.5px solid #2e2e3a", borderRadius: "8px", padding: "24px", background: "rgba(255,255,255,0.02)", marginBottom: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: "11px", color: "#5a5a72", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "5px", fontFamily: "'Georgia', serif" }}>
                          Chapter {safeIdx + 1}
                        </div>
                        <div style={{ fontSize: "20px", color: "#e8e0d0", fontFamily: "'Georgia', serif" }}>
                          {chapter.title || `Chapter ${safeIdx + 1}`}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, marginLeft: "16px" }}>
                        <ChapterStatusBadge status={chapter.status} />
                        <button
                          onClick={() => moveChapter(safeIdx, safeIdx - 1)}
                          disabled={safeIdx === 0}
                          title="Move chapter up"
                          style={{ ...ghostBtn, padding: "8px 11px", opacity: safeIdx === 0 ? 0.35 : 1, cursor: safeIdx === 0 ? "default" : "pointer" }}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveChapter(safeIdx, safeIdx + 1)}
                          disabled={safeIdx === story.chapters.length - 1}
                          title="Move chapter down"
                          style={{ ...ghostBtn, padding: "8px 11px", opacity: safeIdx === story.chapters.length - 1 ? 0.35 : 1, cursor: safeIdx === story.chapters.length - 1 ? "default" : "pointer" }}
                        >
                          ↓
                        </button>
                        <button onClick={() => onEditChapter(chapter.id)} style={ghostBtn}>Edit</button>
                        <button onClick={() => onDeleteChapter(chapter.id)} style={{ ...ghostBtn, color: "#8a5a5a", borderColor: "#4a2a2a" }}>Remove</button>
                      </div>
                    </div>
                    {chapter.wordCount > 0 && (
                      <div style={{ fontSize: "12px", color: "#7a7a95", marginTop: "10px" }}>
                        {chapter.wordCount.toLocaleString()} words
                      </div>
                    )}
                  </div>

                  <Section title="Chapter Draft">
                    <DraftEditor
                      value={chapter.content}
                      onChange={(val) => onUpdateChapterContent(chapter.id, val)}
                      placeholder="Write your chapter draft here. Changes are saved automatically."
                    />
                  </Section>

                  <ChapterSummary
                    settings={settings}
                    chapter={chapter}
                    chapterNumber={safeIdx + 1}
                    priorSummaries={story.chapters.slice(0, safeIdx).map(c => c.summary || "")}
                    onChange={(val) => onUpdateChapterSummary(chapter.id, val)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: "40px" }}>
        <Section title="Story Memories">
          <StoryMemories
            settings={settings}
            story={story}
            onAddMemory={(data) => onAddMemory(story.id, data)}
            onUpdateMemory={(memoryId, data) => onUpdateMemory(story.id, memoryId, data)}
            onRemoveMemory={(memoryId) => onRemoveMemory(story.id, memoryId)}
            onSetMemories={(memories) => onSetMemories(story.id, memories)}
          />
        </Section>
      </div>
    </div>
  );
}
