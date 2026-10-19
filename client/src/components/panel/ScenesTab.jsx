import { useEffect, useRef, useState } from 'react';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { rememberedCaret } from '../../utils/editorBlocks.js';
import { sceneList, sceneAtNode, writeSceneCard, removeSceneBreak, scrollToScene, positionOptions } from '../../utils/scenes.js';
import { flushOpenChapter } from '../../utils/versionHistory.js';
import { chapterLabel } from '../../utils/catchGroups.js';
import { moveSceneRequest, destinationScenes, dropIndex } from '../../utils/sceneMoves.js';
import SceneRow from './SceneRow.jsx';
import { ChapterThreads } from './ThreadChips.jsx';
import { setChapterThreads, toggleTag, tagList } from '../../utils/threads.js';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

const editorRoot = () => document.querySelector('.editor');
const names = (list) => (list || []).map((e) => e?.name).filter((n) => typeof n === 'string' && n.trim());

export default function ScenesTab({ workId }) {
  const { state: editorState, replaceContent } = useEditor();
  const { state: workState, refreshCodex, refreshChapters, refreshThreads } = useActiveWork();
  const [scenes, setScenes] = useState([]);
  const [current, setCurrent] = useState(-1);
  const [errors, setErrors] = useState({});
  const listRef = useRef([]);
  const [busy, setBusy] = useState(false);
  // A move up or down disables its own button while it runs, and the row then sits
  // one place over: focus goes to that row's button once the move has finished
  const moveList = useRef(null);
  const pendingMove = useRef(null); // { key, toIndex, label } while a move is in flight
  useEffect(() => {
    const pending = pendingMove.current;
    if (!pending || busy) return;
    const list = moveList.current;
    const row = list?.querySelector(`[data-scene-key="${pending.key}"]`);
    // Wait until the list shows the scene in its new place; until then its buttons are the old ones
    if (!row || [...list.children].indexOf(row) !== pending.toIndex) return;
    pendingMove.current = null;
    const enabled = (label) => {
      const btn = row?.querySelector(`[aria-label="${label}"]`);
      return btn && !btn.disabled ? btn : null;
    };
    const other = pending.label === 'Move up' ? 'Move down' : 'Move up';
    const next = enabled(pending.label) || enabled(other);
    if (next && (!document.activeElement || document.activeElement === document.body)) next.focus();
  });
  const [notice, setNotice] = useState('');
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [tagging, setTagging] = useState(false);
  const [tagError, setTagError] = useState('');

  // POV and location suggestions come from the Codex, loaded on demand
  useEffect(() => {
    if (!workState.codex && workId) refreshCodex(workId);
  }, [workState.codex, workId, refreshCodex]);

  // Chip names and colours come from the work's threads, loaded on demand
  useEffect(() => {
    if (workId) refreshThreads(workId);
  }, [workId, refreshThreads]);

  // The editor DOM is the source; refresh shortly after typing stops
  useEffect(() => {
    const timer = setTimeout(() => {
      const root = editorRoot();
      const list = root ? sceneList(root) : [];
      listRef.current = list;
      setScenes(list);
      if (root) setCurrent(sceneAtNode(root, rememberedCaret(root), list));
    }, 300);
    return () => clearTimeout(timer);
  }, [editorState.html, editorState.chapterId]);

  useEffect(() => {
    function onSelectionChange() {
      const root = editorRoot();
      if (root) setCurrent(sceneAtNode(root, rememberedCaret(root), listRef.current));
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const withRoot = (key, fn) => {
    const root = editorRoot();
    if (!root) {
      setErrors((e) => ({ ...e, [key]: 'Open a chapter first.' }));
      return;
    }
    try {
      fn(root);
      setErrors((e) => ({ ...e, [key]: '' }));
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err.message || 'Something went wrong.' }));
    }
  };

  // focusAfter is the row's button to focus once the move has landed; it is only
  // pending while the move runs, so a move that never starts leaves nothing behind
  async function move(scene, toChapterId, toIndex, focusAfter = null) {
    const key = scene.id || 'opening';
    pendingMove.current = focusAfter;
    setBusy(true);
    setNotice('');
    try {
      const chapterId = editorState.chapterId;
      await flushOpenChapter(api, workId, editorState, chapterId);
      const { chapters } = await moveSceneRequest(api, workId, { chapterId, scene, toChapterId, toIndex });
      const open = (chapters || []).find((c) => c.id === chapterId);
      // The response carries the new HTML, so a pending autosave can't put the old text back
      if (open) replaceContent(open.content || '', open.contentHtml || '');
      await refreshChapters(workId);
      if (chapters?.length) setNotice('Moved. History has the version from before the move.');
      setErrors((e) => ({ ...e, [key]: '' }));
    } catch (err) {
      pendingMove.current = null;
      setErrors((e) => ({ ...e, [key]: err.message || 'The scene could not be moved.' }));
    } finally {
      setBusy(false);
    }
  }

  const threads = workState.threads || [];
  const chapter = (workState.chapters || []).find((c) => c.id === editorState.chapterId);
  const chapterTags = tagList(chapter?.threadIds);

  async function toggleChapterThread(threadId) {
    setTagging(true);
    setTagError('');
    try {
      await setChapterThreads(api, workId, editorState.chapterId, toggleTag(chapterTags, threadId));
      await refreshChapters(workId);
    } catch (err) {
      setTagError(err.message || 'The tag could not be saved.');
    } finally {
      setTagging(false);
    }
  }
  const chapterThreads = (
    <ChapterThreads threads={threads} selected={chapterTags} onToggle={toggleChapterThread} busy={tagging} error={tagError} />
  );

  if (!editorState.chapterId) return <p className="scenes-empty">Open a chapter to see its scenes.</p>;

  const hasMarkers = scenes.some((s) => s.id);
  if (!hasMarkers) {
    return (
      <div className="scenes-tab">
        {chapterThreads}
        <ul className="scene-list">
          <li className="scene-row">
            <span className="scene-row-title">Whole chapter</span>
            <span className="scene-row-words">{(scenes[0]?.wordCount || 0).toLocaleString('en-US')} words</span>
          </li>
        </ul>
        <p className="scenes-hint">Add a scene break (Ctrl+Shift+Enter) to split this chapter into scenes.</p>
      </div>
    );
  }

  const characters = names(workState.codex?.characters);
  const places = names(workState.codex?.places);

  return (
    <div className="scenes-tab">
      {chapterThreads}
      {notice && <p className="scenes-notice">{notice}</p>}
      <ul className="scene-list" ref={moveList}>
        {scenes.map((scene) => {
          const key = scene.id || 'opening';
          return (
            <SceneRow
              key={key}
              rowKey={key}
              scene={scene}
              threads={threads}
              current={scene.index === current}
              characters={characters}
              places={places}
              error={errors[key]}
              onJump={() => withRoot(key, (root) => scrollToScene(root, sceneList(root)[scene.index]))}
              onSave={(fields) => withRoot(key, (root) => writeSceneCard(root, scene.index, fields))}
              onRemove={() => withRoot(key, (root) => removeSceneBreak(root, sceneList(root)[scene.index]?.marker))}
              busy={busy}
              dragging={dragFrom === scene.index}
              dropTarget={dragOver === scene.index && dragFrom !== null && dragFrom !== scene.index}
              dragProps={{
                draggable: !busy,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDragFrom(scene.index);
                },
                onDragOver: (e) => {
                  e.preventDefault();
                  setDragOver(scene.index);
                },
                onDragLeave: () => setDragOver((v) => (v === scene.index ? null : v)),
                onDrop: (e) => {
                  e.preventDefault();
                  const to = dragFrom === null ? null : dropIndex(dragFrom, scene.index);
                  const from = scenes[dragFrom];
                  setDragFrom(null);
                  setDragOver(null);
                  if (to !== null && from) move(from, editorState.chapterId, to);
                },
                onDragEnd: () => {
                  setDragFrom(null);
                  setDragOver(null);
                },
              }}
            >
              <button className="btn btn-ghost btn-sm" aria-label="Move up" title="Move up" disabled={scene.index === 0} {...busyProps(busy)}
                onClick={guardBusy(busy, () => move(scene, editorState.chapterId, scene.index - 1, { key, toIndex: scene.index - 1, label: 'Move up' }))}>↑</button>
              <button className="btn btn-ghost btn-sm" aria-label="Move down" title="Move down" disabled={scene.index === scenes.length - 1} {...busyProps(busy)}
                onClick={guardBusy(busy, () => move(scene, editorState.chapterId, scene.index + 1, { key, toIndex: scene.index + 1, label: 'Move down' }))}>↓</button>
              <MoveTo
                scene={scene}
                scenes={scenes}
                chapters={workState.chapters || []}
                openChapterId={editorState.chapterId}
                disabled={busy}
                onMove={(toChapterId, toIndex) => move(scene, toChapterId, toIndex)}
              />
            </SceneRow>
          );
        })}
      </ul>
    </div>
  );
}

function MoveTo({ scene, scenes, chapters, openChapterId, disabled, onMove }) {
  const [open, setOpen] = useState(false);
  const [chapterId, setChapterId] = useState(openChapterId);
  const [toIndex, setToIndex] = useState('');
  // Cancel unmounts the form with focus in it: hand focus back to the button that opens it
  const openBtn = useRef(null);
  const returnFocus = useReturnFocus();
  const same = chapterId === openChapterId;
  const dest = same
    ? scenes.map((s) => ({ title: s.title, index: s.index }))
    : destinationScenes(chapters.find((c) => c.id === chapterId));
  const options = positionOptions(dest, same ? { index: scene.index } : null);
  if (!open) {
    return (
      <button ref={openBtn} className="btn btn-ghost btn-sm" {...busyProps(disabled)} onClick={guardBusy(disabled, () => setOpen(true))}>
        Move to…
      </button>
    );
  }
  return (
    <div className="scene-move-form">
      <select className="form-select" value={chapterId} aria-label="Chapter" autoFocus
        onChange={(e) => { setChapterId(e.target.value); setToIndex(''); }}>
        {chapters.map((c) => <option key={c.id} value={c.id}>{chapterLabel(c)}</option>)}
      </select>
      <select className="form-select" value={toIndex} aria-label="Position" onChange={(e) => setToIndex(e.target.value)}>
        <option value="" disabled>Choose a position</option>
        {options.map((o) => <option key={o.toIndex} value={o.toIndex}>{o.label}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm" onClick={() => { returnFocus(openBtn); setOpen(false); }}>Cancel</button>
      <button className="btn btn-primary btn-sm" disabled={toIndex === ''} {...busyProps(disabled)}
        onClick={guardBusy(disabled, () => { setOpen(false); onMove(chapterId, Number(toIndex)); })}>Move</button>
    </div>
  );
}
