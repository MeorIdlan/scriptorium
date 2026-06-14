import { useState } from "react";
import { StatusBadge } from "./StatusBadge";

export default function StoryCard({ story, onClick }) {
  const [hovered, setHovered] = useState(false);
  const progress = story.wordCountTarget > 0
    ? Math.min(100, Math.round((story.wordCountCurrent / story.wordCountTarget) * 100))
    : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1.5px solid ${hovered ? "#c9a96e" : "#2e2e3a"}`,
        borderRadius: "8px", padding: "20px",
        background: hovered ? "rgba(201,169,110,0.05)" : "rgba(255,255,255,0.02)",
        cursor: "pointer", transition: "all 0.2s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
        <div style={{ fontSize: "16px", color: "#e8e0d0", fontFamily: "'Georgia', serif", paddingRight: "10px" }}>
          {story.title}
        </div>
        <StatusBadge status={story.status} />
      </div>

      <div style={{ fontSize: "12px", color: "#5a5a72", marginBottom: "10px" }}>
        {story.type === "serialized"
          ? `Serialized · ${story.chapters.length} chapter${story.chapters.length !== 1 ? "s" : ""}`
          : "One-Shot"}
      </div>

      {story.genres.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
          {story.genres.slice(0, 3).map(g => (
            <span key={g} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "3px", border: "1px solid #2e2e3a", color: "#7a7a95" }}>{g}</span>
          ))}
          {story.genres.length > 3 && (
            <span style={{ fontSize: "11px", color: "#5a5a72" }}>+{story.genres.length - 3}</span>
          )}
        </div>
      )}

      {progress !== null && (
        <div>
          <div style={{ height: "3px", background: "#1e1e2a", borderRadius: "2px", overflow: "hidden", marginBottom: "4px" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#c9a96e", borderRadius: "2px" }} />
          </div>
          <div style={{ fontSize: "11px", color: "#5a5a72", textAlign: "right" }}>
            {story.wordCountCurrent.toLocaleString()} / {story.wordCountTarget.toLocaleString()} words
          </div>
        </div>
      )}
    </div>
  );
}
