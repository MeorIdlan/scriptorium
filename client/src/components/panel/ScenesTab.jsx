import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { rememberedCaret } from '../../utils/editorBlocks.js';
import { sceneList, sceneAtNode, writeSceneCard, removeSceneBreak, scrollToScene } from '../../utils/scenes.js';
import SceneRow from './SceneRow.jsx';

const editorRoot = () => document.querySelector('.editor');
const names = (list) => (list || []).map((e) => e?.name).filter((n) => typeof n === 'string' && n.trim());

export default function ScenesTab({ workId }) {
  const { state: editorState } = useEditor();
  const { state: workState, refreshCodex } = useActiveWork();
  const [scenes, setScenes] = useState([]);
  const [current, setCurrent] = useState(-1);
  const [errors, setErrors] = useState({});
  const listRef = useRef([]);

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
            />
          );
        })}
      </ul>
    </div>
  );
}
