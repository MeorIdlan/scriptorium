import { useEffect, useRef, useState } from 'react';
import { useReturnFocus } from '../hooks/useReturnFocus.js';
import { useParams, useNavigate } from 'react-router-dom';
import { useActiveWork } from '../context/ActiveWorkContext.jsx';
import { useEditor } from '../context/EditorContext.jsx';
import { api } from '../utils/api.js';
import { useWritingSession } from '../hooks/useWritingSession.js';
import Toolbar from '../components/editor/Toolbar.jsx';
import Editor from '../components/editor/Editor.jsx';
import WordCounter from '../components/editor/WordCounter.jsx';
import RightPanel from '../components/panel/RightPanel.jsx';
import MilestonesModal from '../components/overlays/MilestonesModal.jsx';
import BackupReminder from '../components/backup/BackupReminder.jsx';
import { openCountsByChapter } from '../utils/catchGroups.js';
import { useUI } from '../context/UIContext.jsx';
import { sceneList, scrollToScene } from '../utils/scenes.js';
import { chapterToLoad, createChapterLoader } from '../utils/chapterLoad.js';

export default function MainRoom() {
  const { workId, chapterId: urlChapterId } = useParams();
  const navigate = useNavigate();
  const { state, loadWork, updateWork } = useActiveWork();
  const { state: editorState, loadContent } = useEditor();
  const editorRef = useRef(null);
  const [chapterContent, setChapterContent] = useState({ id: null, text: '', html: '' });
  const [addingChapter, setAddingChapter] = useState(false);
  // Closing the add-chapter field unmounts it with focus in it; a keyboard close
  // hands focus back to the + that opened it
  const addChapterBtn = useRef(null);
  const returnFocus = useReturnFocus();
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [loadingChapterId, setLoadingChapterId] = useState(null);
  const [failedChapterId, setFailedChapterId] = useState(null);
  // Bumped to fetch the URL's chapter again after a failure
  const [retryCount, setRetryCount] = useState(0);

  // The one place chapters are fetched: the effect below asks for the URL's
  // chapter, and the loader drops repeat asks and replies that arrive too late
  const workIdRef = useRef(workId);
  workIdRef.current = workId;
  // The chapter whose text this page holds (EditorContext can remember one
  // from an earlier visit or another work)
  const loadedChapterIdRef = useRef(chapterContent.id);
  loadedChapterIdRef.current = chapterContent.id;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const loaderRef = useRef(null);
  if (!loaderRef.current) {
    loaderRef.current = createChapterLoader({
      fetchChapter: (chId) => api.get(`/works/${workIdRef.current}/chapters/${chId}`),
      onLoaded: (chId, chapter) => {
        const text = chapter.content || '';
        const html = chapter.contentHtml || '';
        setFailedChapterId(null);
        setChapterContent({ id: chId, text, html });
        loadContent(chId, text, html);
      },
      onError: (chId, err) => {
        console.error('Failed to load chapter:', err);
        // Point the URL back at the chapter still on screen, so it matches
        // the editor and clicking the failed chapter again retries it
        const shown = loadedChapterIdRef.current;
        if (shown) navigateRef.current(`/work/${workIdRef.current}/chapter/${shown}`, { replace: true });
        else setFailedChapterId(chId);
      },
      onLoadingChange: setLoadingChapterId,
    });
  }
  useEffect(() => () => loaderRef.current.cancel(), []);

  const { state: uiState, dispatch: uiDispatch } = useUI();

  useWritingSession(workId, editorState.chapterId);

  // "Open in editor" from the Map: scroll once the chapter is in the editor
  useEffect(() => {
    const pending = uiState.pendingScene;
    if (!pending || pending.chapterId !== editorState.chapterId || chapterContent.id !== pending.chapterId) return;
    const frame = requestAnimationFrame(() => {
      const root = document.querySelector('.editor');
      if (root) scrollToScene(root, sceneList(root)[pending.sceneIndex]);
      uiDispatch({ type: 'CLEAR_PENDING_SCENE' });
    });
    return () => cancelAnimationFrame(frame);
  }, [uiState.pendingScene, editorState.chapterId, chapterContent, uiDispatch]);

  // Load work data on mount / workId change
  useEffect(() => {
    if (workId) {
      loadWork(workId);
    }
  }, [workId, loadWork]);

  // Determine which chapter to open
  useEffect(() => {
    // Until this work has loaded, the context still holds the previous one
    if (state.work?.id !== workId) return;
    const target = chapterToLoad({
      urlChapterId,
      work: state.work,
      chapters: state.chapters,
      editorChapterId: editorState.chapterId,
      loadedChapterId: chapterContent.id,
    });
    // No target means the URL's chapter is the one on screen: drop any
    // fetch still out for another chapter (a click back, or browser Back)
    if (target) loaderRef.current.load(target);
    else loaderRef.current.cancel();
  }, [state.chapters, state.work, workId, urlChapterId, chapterContent.id, retryCount]);

  // Changing the URL is enough: the effect above loads the chapter
  function handleChapterSelect(chId) {
    if (chId === (urlChapterId || editorState.chapterId)) {
      if (chapterContent.id !== chId) setRetryCount((n) => n + 1);
      return;
    }
    navigate(`/work/${workId}/chapter/${chId}`);
  }

  async function handleAddChapter() {
    if (!newChapterTitle.trim()) return returnFocus(null);
    try {
      const chapter = await api.post(`/works/${workId}/chapters`, {
        title: newChapterTitle.trim(),
      });
      await loadWork(workId);
      setNewChapterTitle('');
      setAddingChapter(false);
      handleChapterSelect(chapter.id);
    } catch (err) {
      returnFocus(null); // the field stays open for another try
      console.error('Failed to add chapter:', err);
    }
  }

  if (state.loading) {
    return <div className="loading-page"><p className="loading-text">Loading…</p></div>;
  }

  if (state.error) {
    return <div className="loading-page"><p className="error-text">{state.error}</p></div>;
  }

  const catchCounts = openCountsByChapter(state.catches);

  return (
    <div className="main-room">
      <Toolbar editorRef={editorRef} />

      <div className="main-room-body">
        {/* Chapter list sidebar */}
        <aside className="chapter-sidebar">
          <div className="chapter-sidebar-header">
            <span className="chapter-sidebar-title">Chapters</span>
            <div className="chapter-sidebar-actions">
              <button
                className="chapter-add-btn"
                onClick={() => setMilestonesOpen(true)}
                title="Milestones — save and compare the whole book"
                aria-label="Milestones"
              >
                ◆
              </button>
              <button
                className="chapter-add-btn"
                ref={addChapterBtn}
                onClick={() => setAddingChapter((v) => !v)}
                title="Add chapter"
                aria-label="Add chapter"
              >
                +
              </button>
            </div>
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
                  if (e.key === 'Enter') {
                    // Claim the key, or this same Enter would click the + focus returns to
                    e.preventDefault();
                    returnFocus(addChapterBtn);
                    handleAddChapter();
                  }
                  if (e.key === 'Escape') {
                    returnFocus(addChapterBtn);
                    setAddingChapter(false);
                  }
                }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  returnFocus(addChapterBtn);
                  handleAddChapter();
                }}
              >
                Add
              </button>
            </div>
          )}

          <div className="chapter-list">
            {state.chapters.map((ch) => {
              const openCatches = catchCounts.get(ch.id) || 0;
              return (
                <button
                  key={ch.id}
                  className={`chapter-item${ch.id === editorState.chapterId ? ' active' : ''}${openCatches ? ' has-catches' : ''}`}
                  onClick={() => handleChapterSelect(ch.id)}
                >
                  <span className="chapter-item-num">Ch. {ch.number}</span>
                  <span className="chapter-item-title">{ch.title || 'Untitled'}</span>
                  {ch.status === 'outline' && (
                    <span className="chapter-item-badge outline">outline</span>
                  )}
                  {openCatches > 0 && (
                    <span
                      className="chapter-item-catch-dot"
                      title={`${openCatches} open catch${openCatches === 1 ? '' : 'es'}`}
                      aria-label={`${openCatches} open catch${openCatches === 1 ? '' : 'es'}`}
                    />
                  )}
                </button>
              );
            })}
            {state.chapters.length === 0 && (
              <p className="chapter-list-empty">No chapters yet</p>
            )}
          </div>
        </aside>

        {/* Editor area */}
        <div className="editor-area">
          {state.work && (
            <BackupReminder
              work={state.work}
              variant="banner"
              onChange={(backupReminder) => updateWork({ backupReminder })}
            />
          )}
          <div className="editor-wrap">
            {loadingChapterId !== null ? (
              <p className="editor-loading-note">Loading…</p>
            ) : (
              failedChapterId !== null && (
                <p className="editor-loading-note">Couldn’t load this chapter. Click it in the list to try again.</p>
              )
            )}
            <Editor
              ref={editorRef}
              workId={workId}
              initialContent={chapterContent.text}
              initialHtml={chapterContent.html}
              // Read-only until this page holds the chapter the editor is on:
              // typing into an empty editor would save over the whole chapter
              loading={loadingChapterId !== null || chapterContent.id === null || chapterContent.id !== editorState.chapterId}
              // Re-mount on chapter change, and once this page has the chapter's text
              key={`${editorState.chapterId}:${chapterContent.id}`}
            />
          </div>
          <WordCounter />
        </div>

        {/* Right panel */}
        <RightPanel workId={workId} />
      </div>

      {milestonesOpen && <MilestonesModal workId={workId} onDismiss={() => setMilestonesOpen(false)} />}
    </div>
  );
}
