import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAI } from '../../hooks/useAI.js';
import { formatNumber } from '../../utils/wordCount.js';

const FRAMEWORK_BEATS = [
  'Inciting Incident',
  'Lock In',
  'First Plot Point',
  'Midpoint',
  'Second Plot Point',
  'Pre-Climax',
  'Climax',
  'Resolution',
];

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

export default function ChapterDetail({ workId, chapterId, chapters }) {
  const navigate = useNavigate();
  const { loading: aiLoading, error: aiError, result: aiResult, call: aiCall } = useAI();

  const chapter = chapters.find((ch) => ch.id === chapterId);

  const [tension, setTension] = useState(chapter?.tensionScore ?? 50);
  const [beat, setBeat] = useState(chapter?.beat ?? '');
  const [notes, setNotes] = useState(chapter?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (chapter) {
      setTension(chapter.tensionScore ?? 50);
      setBeat(chapter.beat ?? '');
      setNotes(chapter.notes ?? '');
    }
  }, [chapterId, chapter]);

  if (!chapter) {
    return (
      <div className="chapter-detail-empty">
        <p>Select a chapter block to view details.</p>
      </div>
    );
  }

  async function save(updates) {
    setSaving(true);
    try {
      await api.put(`/works/${workId}/map/chapters/${chapterId}`, updates);
    } catch (err) {
      console.error('Save chapter map data failed:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleTensionChange(val) {
    setTension(val);
    await save({ tensionScore: val });
  }

  async function handleBeatChange(val) {
    setBeat(val);
    await save({ beat: val || null });
  }

  async function handleNotesBlur() {
    await save({ notes });
  }

  async function handleAnalysePacing() {
    await aiCall('pacing', { workId, chapterId, context: notes });
  }

  return (
    <div className="chapter-detail">
      <div className="chapter-detail-left">
        <h3 className="chapter-detail-title">Ch. {chapter.number} — {chapter.title}</h3>

        <div className="chapter-detail-metrics">
          <MetricCard label="Words" value={formatNumber(chapter.wordCount || 0)} />
          <MetricCard label="Status" value={chapter.status || 'draft'} />
          <MetricCard label="Act" value={chapter.act || '—'} />
        </div>

        <div className="chapter-detail-field">
          <label className="chapter-detail-label">
            Tension Score: <strong>{tension}</strong>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={tension}
            className="tension-slider"
            onChange={(e) => setTension(Number(e.target.value))}
            onMouseUp={(e) => handleTensionChange(Number(e.target.value))}
            onTouchEnd={(e) => handleTensionChange(Number(e.target.value))}
          />
        </div>

        <div className="chapter-detail-field">
          <label className="chapter-detail-label">Beat</label>
          <select
            className="form-select"
            value={beat}
            onChange={(e) => handleBeatChange(e.target.value)}
          >
            <option value="">Unassigned</option>
            {FRAMEWORK_BEATS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="chapter-detail-field">
          <label className="chapter-detail-label">Notes / Summary</label>
          <textarea
            className="form-textarea"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Scene notes, summary…"
          />
        </div>
      </div>

      <div className="chapter-detail-right">
        {(!beat) && (
          <div className="chapter-detail-warning">
            <p>⚠ No beat assigned to this chapter.</p>
          </div>
        )}

        <div className="chapter-detail-actions">
          <button
            className="btn btn-secondary"
            onClick={handleAnalysePacing}
            disabled={aiLoading}
          >
            {aiLoading ? 'Analysing…' : 'Analyse Pacing'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/work/${workId}/chapter/${chapterId}`)}
          >
            Open in Main Room
          </button>
        </div>

        {aiError && <p className="panel-error">{aiError}</p>}
        {aiResult && (
          <div className="ai-result">
            <p className="ai-result-text">{aiResult.analysis || aiResult.text || JSON.stringify(aiResult)}</p>
          </div>
        )}

        {saving && <p className="chapter-detail-saving">Saving…</p>}
      </div>
    </div>
  );
}
