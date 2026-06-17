import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActiveWork } from '../context/ActiveWorkContext.jsx';
import { useEditor } from '../context/EditorContext.jsx';
import { api } from '../utils/api.js';
import Toolbar from '../components/editor/Toolbar.jsx';
import Editor from '../components/editor/Editor.jsx';
import WordCounter from '../components/editor/WordCounter.jsx';
import RightPanel from '../components/panel/RightPanel.jsx';

export default function MainRoom() {
  const { workId, chapterId: urlChapterId } = useParams();
  const navigate = useNavigate();
  const { state, loadWork } = useActiveWork();
  const { state: editorState, loadContent } = useEditor();
  const editorRef = useRef(null);
  const [chapterContent, setChapterContent] = useState('');
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  // Load work data on mount / workId change
  useEffect(() => {
    if (workId) {
      loadWork(workId);
    }
  }, [workId, loadWork]);

  // Determine which chapter to open
  useEffect(() => {
    if (!state.chapters || state.chapters.length === 0) return;

    let targetChapterId = urlChapterId;
    if (!targetChapterId && state.work?.currentChapterId) {
      targetChapterId = state.work.currentChapterId;
    }
    if (!targetChapterId) {
      targetChapterId = state.chapters[0]?.id;
    }

    if (targetChapterId && targetChapterId !== editorState.chapterId) {
      loadChapter(targetChapterId);
    }
  }, [state.chapters, state.work, urlChapterId]);

  async function loadChapter(chId) {
    try {
      const chapter = await api.get(`/works/${workId}/chapters/${chId}`);
      const content = chapter.content || '';
      setChapterContent(content);
      loadContent(chId, chapter.innerText || content);
    } catch (err) {
      console.error('Failed to load chapter:', err);
    }
  }

  function handleChapterSelect(chId) {
    if (chId === editorState.chapterId) return;
    navigate(`/work/${workId}/chapter/${chId}`);
    loadChapter(chId);
  }

  async function handleAddChapter() {
    if (!newChapterTitle.trim()) return;
    try {
      const chapter = await api.post(`/works/${workId}/chapters`, {
        title: newChapterTitle.trim(),
      });
      await loadWork(workId);
      setNewChapterTitle('');
      setAddingChapter(false);
      handleChapterSelect(chapter.id);
    } catch (err) {
      console.error('Failed to add chapter:', err);
    }
  }

  if (state.loading) {
    return <div className="loading-page"><p className="loading-text">Loading…</p></div>;
  }

  if (state.error) {
    return <div className="loading-page"><p className="error-text">{state.error}</p></div>;
  }

  return (
    <div className="main-room">
      <Toolbar editorRef={editorRef} />

      <div className="main-room-body">
        {/* Chapter list sidebar */}
        <aside className="chapter-sidebar">
          <div className="chapter-sidebar-header">
            <span className="chapter-sidebar-title">Chapters</span>
            <button
              className="chapter-add-btn"
              onClick={() => setAddingChapter((v) => !v)}
              title="Add chapter"
            >
              +
            </button>
          </div>

          {addingChapter && (
            <div className="chapter-add-form">
              <input
                className="chapter-add-input"
                type="text"
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                placeholder="Chapter title"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddChapter();
                  if (e.key === 'Escape') setAddingChapter(false);
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddChapter}>Add</button>
            </div>
          )}

          <div className="chapter-list">
            {state.chapters.map((ch) => (
              <button
                key={ch.id}
                className={`chapter-item${ch.id === editorState.chapterId ? ' active' : ''}`}
                onClick={() => handleChapterSelect(ch.id)}
              >
                <span className="chapter-item-num">Ch. {ch.number}</span>
                <span className="chapter-item-title">{ch.title || 'Untitled'}</span>
                {ch.status === 'outline' && (
                  <span className="chapter-item-badge outline">outline</span>
                )}
              </button>
            ))}
            {state.chapters.length === 0 && (
              <p className="chapter-list-empty">No chapters yet</p>
            )}
          </div>
        </aside>

        {/* Editor area */}
        <div className="editor-area">
          <div className="editor-wrap">
            <Editor
              ref={editorRef}
              workId={workId}
              initialContent={chapterContent}
              key={editorState.chapterId} // re-mount on chapter change
            />
          </div>
          <WordCounter />
        </div>

        {/* Right panel */}
        <RightPanel workId={workId} />
      </div>
    </div>
  );
}
