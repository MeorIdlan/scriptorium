import { createPortal } from "react-dom";

// Styled confirmation modal — replaces native window.confirm to match the app aesthetic.
export default function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const overlay = {
    position: "fixed", inset: 0, zIndex: 1100,
    background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
  };

  const modal = {
    background: "#12121e", border: "1px solid #2e2e3a", borderRadius: "12px",
    padding: "28px 32px", width: "100%", maxWidth: "420px",
    fontFamily: "'Georgia', serif",
  };

  return createPortal(
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={modal} role="alertdialog" aria-modal="true">
        <div style={{ fontSize: "18px", color: "#e8e0d0", marginBottom: message ? "12px" : "24px" }}>
          {title}
        </div>
        {message && (
          <div style={{ fontSize: "13px", color: "#a0988a", lineHeight: "1.65", marginBottom: "24px" }}>
            {message}
          </div>
        )}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent", border: "1.5px solid #2e2e3a", borderRadius: "6px",
              color: "#8a8aa5", padding: "10px 20px", fontSize: "12px",
              fontFamily: "'Georgia', serif", cursor: "pointer", letterSpacing: "0.06em",
            }}
          >
            {cancelLabel}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            style={{
              border: "none", borderRadius: "6px",
              padding: "10px 22px", fontSize: "12px",
              fontFamily: "'Georgia', serif", fontWeight: "bold",
              letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
              background: destructive ? "#7a2e2e" : "linear-gradient(135deg, #b8923a 0%, #c9a96e 50%, #d4b87a 100%)",
              color: destructive ? "#f0d0d0" : "#1a1208",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
