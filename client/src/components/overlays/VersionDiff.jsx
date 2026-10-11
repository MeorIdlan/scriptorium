import { useMemo, useState } from 'react';
import { buildHistoryDiff, collapseUnchanged, hasTextChanges } from '../../utils/historyDiff.js';
import { formatNumber } from '../../utils/wordCount.js';

// Word-level comparison of two plain texts. Give it a `key` per pair so
// expanded stretches reset when the pair changes.
export default function VersionDiff({ before, after }) {
  const diff = useMemo(() => buildHistoryDiff(before || '', after || ''), [before, after]);
  const segments = useMemo(() => collapseUnchanged(diff.segments), [diff]);
  const [expanded, setExpanded] = useState(() => new Set());

  if (!hasTextChanges(diff)) {
    return <p className="version-diff-empty">No text changes (formatting changes aren't shown).</p>;
  }

  return (
    <div className="version-diff">
      <div className="version-diff-stats">
        <span className="version-diff-added">+{formatNumber(diff.added)} words</span>
        <span> · </span>
        <span className="version-diff-removed">−{formatNumber(diff.removed)} words</span>
        {diff.paragraphLevel && <span className="version-diff-note">Showing paragraph-level changes</span>}
      </div>
      <div className="version-diff-body">
        {segments.map((seg, i) => {
          if (seg.type === 'equal') return <span key={i}>{seg.text}</span>;
          if (seg.type === 'collapsed') {
            if (expanded.has(i)) return <span key={i}>{seg.text}</span>;
            return (
              <button
                key={i}
                className="version-diff-collapsed"
                onClick={() => setExpanded((prev) => new Set(prev).add(i))}
              >
                … {seg.paragraphs} unchanged paragraph{seg.paragraphs === 1 ? '' : 's'}
              </button>
            );
          }
          return (
            <span key={i} className="version-diff-change">
              {seg.parts.map((part, k) =>
                part.type === 'same' ? (
                  <span key={k}>{part.text}</span>
                ) : (
                  <span key={k} className={part.type === 'del' ? 'polish-del' : 'polish-add'}>{part.text}</span>
                )
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
