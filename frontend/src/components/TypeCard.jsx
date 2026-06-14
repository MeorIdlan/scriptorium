export default function TypeCard({ item, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "14px 16px", borderRadius: "6px",
      border: selected ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
      background: selected ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.02)",
      cursor: "pointer", textAlign: "left", flex: 1, transition: "all 0.2s",
    }}>
      <div style={{ fontSize: "14px", fontFamily: "'Georgia', serif", fontWeight: "bold", marginBottom: "4px", color: selected ? "#c9a96e" : "#5a5a72" }}>
        {item.label}
      </div>
      <div style={{ fontSize: "11px", color: selected ? "#a08a60" : "#3e3e52", letterSpacing: "0.02em" }}>
        {item.desc}
      </div>
    </button>
  );
}
