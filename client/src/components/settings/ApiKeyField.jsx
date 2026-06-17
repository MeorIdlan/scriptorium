import { useState } from 'react';

export default function ApiKeyField({ hasKey, keyPreview, onChange, onTest, onSave, testing, saving, testStatus }) {
  const [value, setValue] = useState('');
  const [showKey, setShowKey] = useState(false);

  function handleChange(e) {
    setValue(e.target.value);
    onChange(e.target.value);
  }

  async function handleSave() {
    if (!value.trim()) return;
    await onSave(value);
    setValue('');
    onChange('');
  }

  const placeholder = hasKey
    ? keyPreview || '••••••••••••••••'
    : 'sk-ant-…';

  return (
    <div className="form-group">
      <label className="form-label">
        API Key {hasKey && <span className="key-set-badge">Key set</span>}
      </label>
      <div className="api-key-field">
        <input
          className="form-input"
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          className="btn btn-ghost btn-sm api-key-toggle"
          type="button"
          onClick={() => setShowKey((v) => !v)}
        >
          {showKey ? 'Hide' : 'Show'}
        </button>
        {onTest && (
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={() => onTest(value)}
            disabled={testing || (!value && !hasKey)}
          >
            {testing ? 'Testing…' : 'Test Key'}
          </button>
        )}
        {onSave && value.trim() && (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Key'}
          </button>
        )}
      </div>
      {hasKey && !value && (
        <p className="form-hint">Leave blank to keep existing key.</p>
      )}
      {testStatus && (
        <div className={`test-result ${testStatus.ok ? 'success' : 'error'}`} style={{ marginTop: '0.5rem' }}>
          {testStatus.ok
            ? `Key valid — ${testStatus.modelCount} model${testStatus.modelCount !== 1 ? 's' : ''} loaded`
            : testStatus.error}
        </div>
      )}
    </div>
  );
}
