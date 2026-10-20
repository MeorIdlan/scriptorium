import { tagList } from '../../utils/threads.js';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

// One toggle chip per plot thread of the work
export function ThreadChips({ threads, selected, onToggle, disabled, label }) {
  const on = tagList(selected);
  return (
    <div className="thread-chips" role="group" aria-label={label}>
      {threads.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`thread-chip${on.includes(t.id) ? ' on' : ''}${t.status === 'resolved' ? ' resolved' : ''}`}
          style={{ '--thread-color': t.color }}
          aria-pressed={on.includes(t.id)}
          {...busyProps(disabled)}
          onClick={guardBusy(disabled, () => onToggle(t.id))}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

// Small coloured dots for the tags a scene carries; ids that aren't threads are skipped
export function ThreadMarkers({ threads, ids }) {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const marks = tagList(ids).map((id) => byId.get(id)).filter(Boolean);
  if (!marks.length) return null;
  return (
    <span className="thread-markers">
      {marks.map((t) => (
        <span key={t.id} className="thread-marker" title={t.name} aria-label={t.name} style={{ background: t.color }} />
      ))}
    </span>
  );
}

// The open chapter's own tags, at the top of the Scenes tab
export function ChapterThreads({ threads, selected, onToggle, busy, error }) {
  return (
    <section className="chapter-threads">
      <h3 className="chapter-threads-title">Chapter threads</h3>
      {threads.length === 0 ? (
        <p className="scenes-hint">No plot threads yet. Define plot threads on the Map.</p>
      ) : (
        <ThreadChips threads={threads} selected={selected} onToggle={onToggle} disabled={busy} label="Chapter threads" />
      )}
      {error && <p className="scene-row-error">{error}</p>}
    </section>
  );
}
