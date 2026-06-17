import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useWorks } from '../../context/WorksContext.jsx';
import { useAI } from '../../hooks/useAI.js';

const GENRES = ['fantasy', 'sci-fi', 'literary', 'thriller', 'romance', 'historical', 'other'];
const POVS = [
  { value: 'first-person', label: 'First Person' },
  { value: 'third-person-limited', label: 'Third Person Limited' },
  { value: 'third-person-omniscient', label: 'Third Person Omniscient' },
  { value: 'second-person', label: 'Second Person' },
];

const INITIAL_FORM = {
  title: '',
  genre: 'fantasy',
  pov: 'third-person-limited',
  tone: '',
  protagonist: '',
  premise: '',
};

export default function NewWorkWizard({ onClose }) {
  const navigate = useNavigate();
  const { addWork } = useWorks();
  const { loading: aiLoading, call: aiCall } = useAI();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);
  const [hooks, setHooks] = useState([]);
  const [selectedHook, setSelectedHook] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function generateHooks() {
    const result = await aiCall('hooks', {
      title: form.title,
      genre: form.genre,
      premise: form.premise,
      protagonist: form.protagonist,
    });
    if (result && result.hooks) {
      setHooks(result.hooks);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        openingHook: selectedHook || undefined,
      };
      const work = await api.post('/works', payload);
      addWork(work);
      navigate(`/work/${work.id}`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function canProceedStep1() {
    return form.title.trim().length > 0;
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wizard-modal">
        <div className="modal-header">
          <h2 className="modal-title">New Work</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="wizard-steps">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`wizard-step-dot${step === s ? ' active' : step > s ? ' done' : ''}`}
            />
          ))}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div className="wizard-step">
              <h3 className="wizard-step-title">The Basics</h3>

              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="Your work's title"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Genre</label>
                <select
                  className="form-select"
                  value={form.genre}
                  onChange={(e) => update('genre', e.target.value)}
                >
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Point of View</label>
                <select
                  className="form-select"
                  value={form.pov}
                  onChange={(e) => update('pov', e.target.value)}
                >
                  {POVS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <h3 className="wizard-step-title">Your Story</h3>

              <div className="form-group">
                <label className="form-label">Tone</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.tone}
                  onChange={(e) => update('tone', e.target.value)}
                  placeholder="e.g. Dark, hopeful, wry, lyrical…"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Protagonist</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.protagonist}
                  onChange={(e) => update('protagonist', e.target.value)}
                  placeholder="Main character's name"
                />
              </div>

              <div className="form-group">
                <label className="form-label">One-line Premise</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.premise}
                  onChange={(e) => update('premise', e.target.value)}
                  placeholder="What's your story about?"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step">
              <h3 className="wizard-step-title">Review</h3>

              <div className="wizard-summary">
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">Title</span>
                  <span className="wizard-summary-value">{form.title}</span>
                </div>
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">Genre</span>
                  <span className="wizard-summary-value">{form.genre}</span>
                </div>
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">POV</span>
                  <span className="wizard-summary-value">{form.pov}</span>
                </div>
                {form.tone && (
                  <div className="wizard-summary-row">
                    <span className="wizard-summary-label">Tone</span>
                    <span className="wizard-summary-value">{form.tone}</span>
                  </div>
                )}
                {form.protagonist && (
                  <div className="wizard-summary-row">
                    <span className="wizard-summary-label">Protagonist</span>
                    <span className="wizard-summary-value">{form.protagonist}</span>
                  </div>
                )}
                {form.premise && (
                  <div className="wizard-summary-row">
                    <span className="wizard-summary-label">Premise</span>
                    <span className="wizard-summary-value">{form.premise}</span>
                  </div>
                )}
              </div>

              {!hooks.length && (
                <button
                  className="btn btn-secondary wizard-hooks-btn"
                  onClick={generateHooks}
                  disabled={aiLoading}
                >
                  {aiLoading ? 'Generating…' : '✨ Generate Opening Hooks'}
                </button>
              )}

              {hooks.length > 0 && (
                <div className="wizard-hooks">
                  <p className="wizard-hooks-label">Choose an opening hook (optional):</p>
                  {hooks.map((hook, i) => (
                    <div
                      key={i}
                      className={`wizard-hook-card${selectedHook === hook ? ' selected' : ''}`}
                      onClick={() => setSelectedHook(selectedHook === hook ? null : hook)}
                    >
                      <p>{hook}</p>
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="form-error">{error}</p>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div className="modal-footer-right">
            {step > 1 && (
              <button className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && !canProceedStep1()}
              >
                Next
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Creating…' : 'Create Work'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
