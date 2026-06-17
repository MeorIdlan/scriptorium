export default function ProviderSelect({ providers, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">Provider</label>
      <select
        className="form-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select a provider…</option>
        {(providers || []).map((p) => (
          <option key={p.id} value={p.id}>{p.label || p.name || p.id}</option>
        ))}
      </select>
    </div>
  );
}
