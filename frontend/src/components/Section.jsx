export default function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span style={{
          color: "#c9a96e", fontSize: "10px", letterSpacing: "0.18em",
          textTransform: "uppercase", fontFamily: "'Georgia', serif", fontWeight: "bold",
        }}>{title}</span>
        <div style={{ flex: 1, height: "1px", background: "#2e2e3a" }} />
      </div>
      {children}
    </div>
  );
}
