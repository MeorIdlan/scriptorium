export default function Tag({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: "4px",
      border: selected ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
      background: selected ? "rgba(201,169,110,0.15)" : "rgba(255,255,255,0.03)",
      color: selected ? "#c9a96e" : "#7a7a95",
      fontSize: "13px", cursor: "pointer",
      fontFamily: "'Georgia', serif", transition: "all 0.2s", letterSpacing: "0.02em",
    }}>
      {label}
    </button>
  );
}
