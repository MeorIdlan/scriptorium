import { STORY_STATUSES, CHAPTER_STATUSES } from "../../constants/tracker";

export function StatusBadge({ status }) {
  const s = STORY_STATUSES.find(x => x.id === status) || STORY_STATUSES[0];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
      <span style={{ fontSize: "11px", color: s.color, letterSpacing: "0.06em", fontFamily: "'Georgia', serif" }}>
        {s.label}
      </span>
    </div>
  );
}

export function ChapterStatusBadge({ status }) {
  const s = CHAPTER_STATUSES.find(x => x.id === status) || CHAPTER_STATUSES[0];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
      <span style={{ fontSize: "11px", color: s.color, letterSpacing: "0.06em", fontFamily: "'Georgia', serif" }}>
        {s.label}
      </span>
    </div>
  );
}
