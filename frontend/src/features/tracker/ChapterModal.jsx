import { useState } from "react";
import { CHAPTER_STATUSES } from "../../constants/tracker";
import Section from "../../components/Section";
import { inputStyle, ghostBtn, primaryBtn } from "../../components/styles";

export default function ChapterModal({ chapter, onSave, onClose }) {
  const [title, setTitle]         = useState(chapter?.title || "");
  const [status, setStatus]       = useState(chapter?.status || "draft");
  const [wordCount, setWordCount] = useState(chapter?.wordCount ?? 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}>
      <div style={{ background: "#12121e", border: "1px solid #2e2e3a", borderRadius: "10px", padding: "32px", width: "100%", maxWidth: "420px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase", fontFamily: "'Georgia', serif" }}>
            {chapter ? "✦ Edit Chapter" : "✦ New Chapter"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a5a72", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>✕</button>
        </div>

        <Section title="Chapter Title">
          <input type="text" placeholder="e.g. The First Light..." value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} autoFocus />
        </Section>

        <Section title="Status">
          <div style={{ display: "flex", gap: "8px" }}>
            {CHAPTER_STATUSES.map(s => (
              <button key={s.id} onClick={() => setStatus(s.id)} style={{
                padding: "6px 14px", borderRadius: "4px",
                border: status === s.id ? `1.5px solid ${s.color}` : "1.5px solid #2e2e3a",
                background: status === s.id ? `${s.color}22` : "rgba(255,255,255,0.03)",
                color: status === s.id ? s.color : "#7a7a95",
                fontSize: "13px", cursor: "pointer",
                fontFamily: "'Georgia', serif", transition: "all 0.2s",
              }}>
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Word Count">
          <input type="number" min={0} value={wordCount} onChange={e => setWordCount(e.target.value)} style={{ ...inputStyle, width: "130px" }} />
        </Section>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={() => onSave({ title, status, wordCount: Number(wordCount) })} style={primaryBtn}>
            {chapter ? "Save Changes" : "Add Chapter"}
          </button>
        </div>
      </div>
    </div>
  );
}
