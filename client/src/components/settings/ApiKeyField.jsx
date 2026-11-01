import { useEffect, useId, useRef, useState } from 'react';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

export default function ApiKeyField({
  hasKey,
  keyPreview,
  onChange,
  onTest,
  onSave,
  onRemove,
  testing,
  saving,
  removing,
  testStatus,
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  // True while "Remove key?" is asking; nothing is sent until "Yes, remove"
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef(null);
  const removeRef = useRef(null);
  const cancelRef = useRef(null);
  // Set when the question closes, so focus goes somewhere sensible afterwards
  const closed = useRef(false);
  const inFlight = useRef(false);

  // The button the writer clicked is replaced by the question, so focus moves
  // to the safe choice
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  // Back to the Remove key button, or to the input once the key is gone
  useEffect(() => {
    if (confirming || !closed.current) return;
    closed.current = false;
    (hasKey ? removeRef.current : inputRef.current)?.focus();
  }, [confirming, hasKey]);

  function handleChange(e) {
    setValue(e.target.value);
    setConfirming(false);
    onChange(e.target.value);
  }

  async function handleSave() {
    if (!value.trim()) return;
    await onSave(value);
    setValue('');
    onChange('');
  }

  // Not while the request runs: the writer should see how it ended
  function closeQuestion() {
    if (inFlight.current) return;
    closed.current = true;
    setConfirming(false);
  }

  async function handleRemove() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await onRemove();
    } finally {
      inFlight.current = false;
      closeQuestion();
    }
  }

  function handleConfirmKeyDown(e) {
    if (e.key === 'Escape') closeQuestion();
  }

  const placeholder = hasKey
    ? keyPreview || '••••••••••••••••'
    : 'sk-ant-…';

  // Only for a saved key and an empty input, so it can never meet an unsaved one
  const canRemove = Boolean(onRemove && hasKey && !value.trim());

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        API Key {hasKey && <span className="key-set-badge">Key set</span>}
      </label>
      <div className="api-key-field">
        <input
          id={id}
          ref={inputRef}
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
            onClick={guardBusy(testing, () => onTest(value))}
            disabled={!value && !hasKey}
            {...busyProps(testing)}
          >
            {testing ? 'Testing…' : 'Test Key'}
          </button>
        )}
        {onSave && value.trim() && (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={guardBusy(saving, handleSave)}
            {...busyProps(saving)}
          >
            {saving ? 'Saving…' : 'Save Key'}
          </button>
        )}
        {canRemove && !confirming && (
          <button
            ref={removeRef}
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setConfirming(true)}
          >
            Remove key
          </button>
        )}
        {canRemove && confirming && (
          <span className="api-key-confirm" role="group" aria-label="Confirm removing the API key" onKeyDown={handleConfirmKeyDown}>
            <span>Remove key?</span>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={guardBusy(removing, handleRemove)}
              {...busyProps(removing)}
            >
              {removing ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              ref={cancelRef}
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={guardBusy(removing, closeQuestion)}
              {...busyProps(removing)}
            >
              Cancel
            </button>
          </span>
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
