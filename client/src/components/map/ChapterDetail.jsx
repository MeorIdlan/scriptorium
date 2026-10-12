import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAI } from '../../hooks/useAI.js';
import { useAiState } from '../../context/AiContext.jsx';
import { formatNumber } from '../../utils/wordCount.js';
import PacingResult from '../panel/PacingResult.jsx';
import ContextUsed from '../panel/ContextUsed.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { scenesForPov } from '../../utils/sceneMap.js';
import { STATUS_LABELS, sceneLabel } from '../../utils/scenes.js';
import { SUMMARY_STATUS_LABELS, summaryRefreshPending } from '../../utils/summaryStatus.js';

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

const ACTS = ['Act I', 'Act II', 'Act III'];

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

export default function ChapterDetail({ workId, chapterId, chapters, pov = '', onSaved }) {
  const navigate = useNavigate();
  const { dispatch: uiDispatch } = useUI();
  const { loading: aiLoading, error: aiError, result: aiResult, call: aiCall } = useAI();
  const { aiOn } = useAiState();

  const chapter = chapters.find((ch) => ch.id === chapterId);

  const [tension, setTension] = useState(chapter?.tensionScore ?? 50);
  const [beat, setBeat] = useState(chapter?.beat ?? '');
  const [act, setAct] = useState(chapter?.act ?? '');
  const [notes, setNotes] = useState(chapter?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (chapter) {
      setTension(chapter.tensionScore ?? 50);
      setBeat(chapter.beat ?? '');
      setAct(chapter.act ?? '');
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
      onSaved?.();
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

  async function handleActChange(val) {
    setAct(val);
    await save({ act: val || null });
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
          <MetricCard label="Act" value={act || '—'} />
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
          <label className="chapter-detail-label">Act</label>
          <select
            className="form-select"
            value={act}
            onChange={(e) => handleActChange(e.target.value)}
          >
            <option value="">Unassigned</option>
            {ACTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
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

        {/* Summaries exist only for AI help */}
        {aiOn && (
          <div className="chapter-detail-field">
            <label className="chapter-detail-label">
              Chapter summary{' '}
              <span className={`summary-status summary-status--${chapter.summaryStatus || 'none'}`}>
                {SUMMARY_STATUS_LABELS[chapter.summaryStatus || 'none']}
              </span>
            </label>
            <p className="chapter-summary-text">{chapter.summary?.text || '—'}</p>
          </div>
        )}

        <div className="chapter-detail-field">
          <label className="chapter-detail-label">Notes</label>
          <textarea
            className="form-textarea"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Scene notes, summary…"
          />
        </div>

        <div className="chapter-detail-field">
          <label className="chapter-detail-label">Scenes</label>
          {(chapter.scenes || []).length === 0 ? (
            <p className="chapter-detail-muted">No scene breaks in this chapter.</p>
          ) : (
            <ul className="map-scene-list">
              {scenesForPov(chapter, pov).map((s) => {
                const meta = [s.pov, s.location].filter((v) => typeof v === 'string' && v.trim()).join(' · ');
                return (
                  <li key={s.id || 'opening'} className="map-scene">
                    <div className="map-scene-head">
                      <span className="scene-row-title">{sceneLabel(s)}</span>
                      <span className={`scene-status scene-status--${s.status || 'draft'}`}>{STATUS_LABELS[s.status] || 'Draft'}</span>
                    </div>
                    {meta && <span className="scene-row-meta">{meta}</span>}
                    <span className="scene-row-words">{(s.wordCount || 0).toLocaleString('en-US')} words</span>
                    {s.summary && <p className="map-scene-summary">{s.summary}</p>}
                    <button
                      className="btn btn-ghost btn-sm map-scene-open"
                      onClick={() => {
                        uiDispatch({ type: 'OPEN_SCENE', chapterId: chapter.id, sceneIndex: s.index });
                        navigate(`/work/${workId}/chapter/${chapter.id}`);
                      }}
                    >
                      Open in editor
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="chapter-detail-right">
        {(!beat) && (
          <div className="chapter-detail-warning">
            <p>⚠ No beat assigned to this chapter.</p>
          </div>
        )}

        <div className="chapter-detail-actions">
          {aiOn && (
            <button
              className="btn btn-secondary"
              onClick={handleAnalysePacing}
              disabled={aiLoading}
            >
              {aiLoading
                ? summaryRefreshPending(chapters, chapterId, 'all')
                  ? 'Analysing… (updating chapter summaries)'
                  : 'Analysing…'
                : 'Analyse Pacing'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/work/${workId}/chapter/${chapterId}`)}
          >
            Open in Main Room
          </button>
        </div>

        {aiOn && aiError && <p className="panel-error">{aiError}</p>}
        {aiOn && aiResult && (
          <div className="ai-result">
            <PacingResult result={aiResult} chapters={chapters} />
            <ContextUsed context={aiResult.context} />
          </div>
        )}

        {saving && <p className="chapter-detail-saving">Saving…</p>}
      </div>
    </div>
  );
}
