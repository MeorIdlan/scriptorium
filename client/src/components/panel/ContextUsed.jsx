import { useState } from 'react';

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function ContextUsed({ context }) {
  const [open, setOpen] = useState(false);
  if (!context) return null;

  const parts = [];
  if (context.story) parts.push('story details');
  if (context.summaries) parts.push(plural(context.summaries, 'chapter summary', 'chapter summaries'));
  if (context.codex?.length) parts.push(plural(context.codex.length, 'Codex entry', 'Codex entries'));
  if (context.rules) parts.push(plural(context.rules, 'rule', 'rules'));
  if (context.beat) parts.push(`Beat: ${context.beat}`);
  if (context.scene) parts.push("this scene's card");
  if (context.sceneList) parts.push(plural(context.sceneList, 'scene card', 'scene cards'));
  if (context.catches) parts.push(plural(context.catches, "writer's note", "writer's notes"));

  const hasDetails = context.codex?.length > 0 || context.act || context.beat;

  return (
    <div className="context-used">
      <button
        className="context-used-line"
        onClick={() => hasDetails && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!hasDetails}
      >
        Context: {parts.join(' · ') || 'none'}
        {hasDetails && <span className="context-used-toggle">{open ? ' ▴' : ' ▾'}</span>}
      </button>
      {context.unavailable > 0 && (
        <p className="context-used-warning">
          {plural(context.unavailable, "summary couldn't be made", "summaries couldn't be made")} — those chapters were sent by title only.
        </p>
      )}
      {open && (
        <div className="context-used-details">
          {context.codex?.length > 0 && <p>Codex: {context.codex.join(', ')}</p>}
          {(context.act || context.beat) && (
            <p>Map: {[context.act, context.beat].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
