import { useId } from 'react';

export default function ModelSelect({ models, value, onChange }) {
  const id = useId();
  const hasModels = models && models.length > 0;

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>Model</label>
      <select
        id={id}
        className="form-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={!hasModels}
      >
        {!hasModels ? (
          <option value="">— test your API key to load models —</option>
        ) : (
          <>
            <option value="">Select a model…</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}
