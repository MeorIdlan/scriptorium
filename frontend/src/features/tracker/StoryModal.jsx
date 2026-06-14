import { useState } from "react";
import { GENRES } from "../../constants/generator";
import { STORY_STATUSES, STORY_TYPE_OPTIONS } from "../../constants/tracker";
import Tag from "../../components/Tag";
import Section from "../../components/Section";
import TypeCard from "../../components/TypeCard";
import { inputStyle, labelStyle, ghostBtn, primaryBtn } from "../../components/styles";

export default function StoryModal({ mode, story, onSave, onClose }) {
  const [title, setTitle]          = useState(story?.title || "");
  const [type, setType]            = useState(story?.type || "oneshot");
  const [status, setStatus]        = useState(story?.status || "planning");
  const [genres, setGenres]        = useState(story?.genres || []);
  const [wordCountCurrent, setWCC] = useState(story?.wordCountCurrent ?? 0);
  const [wordCountTarget, setWCT]  = useState(story?.wordCountTarget ?? 0);
  const [synopsis, setSynopsis]    = useState(story?.synopsis || "");
  const [titleError, setTitleError] = useState(false);

  const toggleGenre = (g) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  const handleSave = () => {
    if (!title.trim()) { setTitleError(true); return; }
    onSave({ title: title.trim(), type, status, genres, wordCountCurrent: Number(wordCountCurrent), wordCountTarget: Number(wordCountTarget), synopsis });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}>
      <div style={{ background: "#12121e", border: "1px solid #2e2e3a", borderRadius: "10px", padding: "32px", width: "100%", maxWidth: "580px", maxHeight: "85vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase", fontFamily: "'Georgia', serif" }}>
            {mode === "create" ? "✦ New Story" : "✦ Edit Story"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a5a72", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>✕</button>
        </div>

        <Section title="Title">
          <input
            type="text" placeholder="Story title..." value={title}
            onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
            style={{ ...inputStyle, borderColor: titleError ? "#7a2e2e" : "#2e2e3a" }}
            autoFocus
          />
          {titleError && (
            <div style={{ fontSize: "12px", color: "#d99", marginTop: "6px", fontFamily: "'Georgia', serif" }}>
              Please enter a title.
            </div>
          )}
        </Section>

        <Section title="Type">
          <div style={{ display: "flex", gap: "8px" }}>
            {STORY_TYPE_OPTIONS.map(t => (
              <TypeCard key={t.id} item={t} selected={type === t.id} onClick={() => setType(t.id)} />
            ))}
          </div>
        </Section>

        <Section title="Status">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {STORY_STATUSES.map(s => (
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

        <Section title="Genres">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {GENRES.map(g => (
              <Tag key={g} label={g} selected={genres.includes(g)} onClick={() => toggleGenre(g)} />
            ))}
          </div>
        </Section>

        <Section title="Word Count">
          <div style={{ display: "flex", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Current</label>
              <input type="number" min={0} value={wordCountCurrent} onChange={e => setWCC(e.target.value)} style={{ ...inputStyle, width: "130px" }} />
            </div>
            <div>
              <label style={labelStyle}>Target</label>
              <input type="number" min={0} value={wordCountTarget} onChange={e => setWCT(e.target.value)} style={{ ...inputStyle, width: "130px" }} />
            </div>
          </div>
        </Section>

        <Section title="Synopsis">
          <textarea rows={3} placeholder="A brief synopsis or notes about this story..." value={synopsis} onChange={e => setSynopsis(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
        </Section>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={handleSave} style={primaryBtn}>
            {mode === "create" ? "Create Story" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
