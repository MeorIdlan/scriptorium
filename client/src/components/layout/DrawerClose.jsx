// The close button at the top of a drawer or sheet
export default function DrawerClose({ label, onClose }) {
  return (
    <button type="button" className="drawer-close" aria-label={`Close ${label}`} onClick={onClose}>
      ×
    </button>
  );
}
