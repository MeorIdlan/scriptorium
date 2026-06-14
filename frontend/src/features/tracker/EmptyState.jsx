import { primaryBtn } from "../../components/styles";

export default function EmptyState({ onNew }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 40px" }}>
      <div style={{ fontSize: "28px", marginBottom: "16px", color: "#2e2e4a" }}>✦</div>
      <div style={{ fontSize: "16px", marginBottom: "8px", color: "#7a7a95", fontFamily: "'Georgia', serif" }}>No stories yet</div>
      <div style={{ fontSize: "13px", marginBottom: "28px", color: "#5a5a72" }}>Begin tracking your first story.</div>
      <button onClick={onNew} style={primaryBtn}>+ New Story</button>
    </div>
  );
}
