import { useEffect, useState } from 'react';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { api } from '../../utils/api.js';
import { chapterLabel, filterCatches, groupCatches } from '../../utils/catchGroups.js';
import { markUsed, markDiscarded, reopen, markUsedAfter, useAsCodex, useAsMapNote } from '../../utils/catchActions.js';
import { insertParagraphAfter, rememberedCaret } from '../../utils/editorBlocks.js';
import CatchRow from './CatchRow.jsx';

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'used', label: 'Used' },
  { value: 'discarded', label: 'Discarded' },
  { value: 'all', label: 'All' },
];

const EMPTY = {
  open: 'No open catches. Press Ctrl+Shift+I to capture an idea.',
  used: 'No used catches.',
  discarded: 'No discarded catches.',
  all: 'No catches yet. Press Ctrl+Shift+I to capture an idea.',
};

// Wraps a plain API call as an action result
async function attempt(fn) {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, stage: 'create', error };
  }
}

export default function CatchTab({ workId }) {
  const { state, refreshCatches, refreshCodex, refreshMap } = useActiveWork();
  const { state: editorState } = useEditor();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open');

  useEffect(() => {
    if (workId) refreshCatches(workId);
  }, [workId, refreshCatches]);

  const chapters = state.chapters || [];
  const currentChapter = chapters.find((ch) => ch.id === editorState.chapterId) || null;
  const visible = filterCatches(state.catches, { status, query, chapters });
  const groups = groupCatches(visible, chapters, editorState.chapterId);

  async function runAction(item, kind, payload) {
    let result;
    switch (kind) {
      case 'edit':
        result = await attempt(() => api.put(`/works/${workId}/catches/${item.id}`, payload));
        break;
      case 'used':
        result = await attempt(() => markUsed(api, workId, item));
        break;
      case 'discard':
        result = await attempt(() => markDiscarded(api, workId, item));
        break;
      case 'reopen':
        result = await attempt(() => reopen(api, workId, item));
        break;
      case 'insert': {
        const root = document.querySelector('.editor');
        if (!root || !currentChapter) {
          result = { ok: false, stage: 'create', error: new Error('Open a chapter to insert into.') };
          break;
        }
        insertParagraphAfter(root, rememberedCaret(root), item.content);
        result = await markUsedAfter(api, workId, item, {
          kind: 'insert',
          refId: currentChapter.id,
          label: chapterLabel(currentChapter),
        });
        break;
      }
      case 'codex':
        result = await useAsCodex(api, workId, item, payload);
        if (result.ok || result.stage === 'mark') refreshCodex(workId);
        break;
      case 'map':
        result = await useAsMapNote(api, workId, item, payload);
        if (result.ok || result.stage === 'mark') refreshMap(workId);
        break;
      default:
        result = { ok: false, stage: 'create', error: new Error(`Unknown action: ${kind}`) };
    }
    refreshCatches(workId);
    return result;
  }

  const trimmed = query.trim();

  return (
    <div className="catch-tab">
      <input
        className="form-input catch-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search catches"
        aria-label="Search catches"
      />
      <div className="catch-filter" role="group" aria-label="Show">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            className={`catch-filter-btn${status === s.value ? ' active' : ''}`}
            onClick={() => setStatus(s.value)}
            aria-pressed={status === s.value}
          >
            {s.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="catch-tab-empty">{trimmed ? `Nothing matches “${trimmed}”.` : EMPTY[status]}</p>
      )}

      {groups.map((group) => (
        <section key={group.key} className={`catch-group${group.key === 'this' ? ' current' : ''}`}>
          <p className="catch-tab-label">{group.title}</p>
          {group.items.map((item) => (
            <CatchRow
              key={item.id}
              item={item}
              chapters={chapters}
              showChapter={group.key !== 'this'}
              canInsert={Boolean(currentChapter)}
              defaultMapChapterId={editorState.chapterId}
              onAction={(kind, payload) => runAction(item, kind, payload)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
