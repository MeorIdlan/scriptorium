import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { rememberedCaret } from '../../utils/editorBlocks.js';
import { sceneList, sceneAtNode, writeSceneCard, removeSceneBreak, scrollToScene, positionOptions } from '../../utils/scenes.js';
import { flushOpenChapter } from '../../utils/versionHistory.js';
import { chapterLabel } from '../../utils/catchGroups.js';
import { moveSceneRequest, destinationScenes, dropIndex } from '../../utils/sceneMoves.js';
import SceneRow from './SceneRow.jsx';

const editorRoot = () => document.querySelector('.editor');
const names = (list) => (list || []).map((e) => e?.name).filter((n) => typeof n === 'string' && n.trim());

export default function ScenesTab({ workId }) {
  const { state: editorState, replaceContent } = useEditor();
  const { state: workState, refreshCodex, refreshChapters } = useActiveWork();
  const [scenes, setScenes] = useState([]);
  const [current, setCurrent] = useState(-1);
  const [errors, setErrors] = useState({});
  const listRef = useRef([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // POV and location suggestions come from the Codex, loaded on demand
  useEffect(() => {
    if (!workState.codex && workId) refreshCodex(workId);
  }, [workState.codex, workId, refreshCodex]);

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

  async function move(scene, toChapterId, toIndex) {
    const key = scene.id || 'opening';
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
      setErrors((e) => ({ ...e, [key]: err.message || 'The scene could not be moved.' }));
    } finally {
      setBusy(false);
    }
  }

  if (!editorState.chapterId) return <p className="scenes-empty">Open a chapter to see its scenes.</p>;

  const hasMarkers = scenes.some((s) => s.id);
  if (!hasMarkers) {
    return (
      <div className="scenes-tab">
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
      {notice && <p className="scenes-notice">{notice}</p>}
      <ul className="scene-list">
        {scenes.map((scene) => {
          const key = scene.id || 'opening';
          return (
            <SceneRow
              key={key}
              scene={scene}
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
              <button className="btn btn-ghost btn-sm" aria-label="Move up" title="Move up" disabled={busy || scene.index === 0}
                onClick={() => move(scene, editorState.chapterId, scene.index - 1)}>↑</button>
              <button className="btn btn-ghost btn-sm" aria-label="Move down" title="Move down" disabled={busy || scene.index === scenes.length - 1}
                onClick={() => move(scene, editorState.chapterId, scene.index + 1)}>↓</button>
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
  const same = chapterId === openChapterId;
  const dest = same
    ? scenes.map((s) => ({ title: s.title, index: s.index }))
    : destinationScenes(chapters.find((c) => c.id === chapterId));
  const options = positionOptions(dest, same ? { index: scene.index } : null);
  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setOpen(true)}>
        Move to…
      </button>
    );
  }
  return (
    <div className="scene-move-form">
      <select className="form-select" value={chapterId} aria-label="Chapter"
        onChange={(e) => { setChapterId(e.target.value); setToIndex(''); }}>
        {chapters.map((c) => <option key={c.id} value={c.id}>{chapterLabel(c)}</option>)}
      </select>
      <select className="form-select" value={toIndex} aria-label="Position" onChange={(e) => setToIndex(e.target.value)}>
        <option value="" disabled>Choose a position</option>
        {options.map((o) => <option key={o.toIndex} value={o.toIndex}>{o.label}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      <button className="btn btn-primary btn-sm" disabled={disabled || toIndex === ''}
        onClick={() => { setOpen(false); onMove(chapterId, Number(toIndex)); }}>Move</button>
    </div>
  );
}
