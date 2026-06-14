import { useState } from "react";
import { exportStoriesJSON } from "../../lib/utils";
import { ghostBtn, primaryBtn } from "../../components/styles";
import StoryCard from "./StoryCard";
import StoryDetail from "./StoryDetail";
import StoryModal from "./StoryModal";
import ChapterModal from "./ChapterModal";
import EmptyState from "./EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function StoryTracker({
  settings,
  stories,
  addStory, updateStory, removeStory,
  addChapter, updateChapter, removeChapter, reorderChapters,
  updateStoryContent, updateChapterContent,
  addMemory, updateMemory, removeMemory, setStoryMemories,
}) {

  const [view, setView]                 = useState("list");
  const [selectedId, setSelectedId]     = useState(null);
  const [chapterIdx, setChapterIdx]     = useState(0);
  const [storyModal, setStoryModal]     = useState({ open: false, mode: "create" });
  const [chapterModal, setChapterModal] = useState({ open: false, chapterId: null });
  const [confirm, setConfirm]           = useState(null); // { title, message, onConfirm }

  const selectedStory = stories.find(s => s.id === selectedId) ?? null;

  const openDetail = (id) => { setSelectedId(id); setView("detail"); setChapterIdx(0); };
  const backToList = () => { setView("list"); setSelectedId(null); setChapterIdx(0); };

  const deleteStory = (id) => {
    setConfirm({
      title: "Delete this story?",
      message: "This permanently removes the story and all its chapters. This cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: () => { removeStory(id); backToList(); },
    });
  };

  const deleteChapter = (storyId, chapterId) => {
    setConfirm({
      title: "Remove this chapter?",
      message: "This permanently removes the chapter. This cannot be undone.",
      confirmLabel: "Remove",
      onConfirm: () => { removeChapter(storyId, chapterId); setChapterIdx(i => Math.max(0, i - 1)); },
    });
  };

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 32px 80px" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        {view === "detail"
          ? <button onClick={backToList} style={ghostBtn}>← Back to Stories</button>
          : <div />
        }
        <div style={{ display: "flex", gap: "10px" }}>
          {stories.length > 0 && (
            <button onClick={() => exportStoriesJSON(stories)} style={ghostBtn}>Export JSON</button>
          )}
          {view === "list" && (
            <button onClick={() => setStoryModal({ open: true, mode: "create" })} style={primaryBtn}>+ New Story</button>
          )}
        </div>
      </div>

      {view === "list" && (
        stories.length === 0
          ? <EmptyState onNew={() => setStoryModal({ open: true, mode: "create" })} />
          : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {stories.map(story => (
                <StoryCard key={story.id} story={story} onClick={() => openDetail(story.id)} />
              ))}
            </div>
          )
      )}

      {view === "detail" && selectedStory && (
        <StoryDetail
          story={selectedStory}
          chapterIdx={chapterIdx}
          setChapterIdx={setChapterIdx}
          settings={settings}
          onEdit={() => setStoryModal({ open: true, mode: "edit" })}
          onDelete={() => deleteStory(selectedStory.id)}
          onAddChapter={() => setChapterModal({ open: true, chapterId: null })}
          onEditChapter={(cid) => setChapterModal({ open: true, chapterId: cid })}
          onDeleteChapter={(cid) => deleteChapter(selectedStory.id, cid)}
          onReorderChapters={(chapters) => reorderChapters(selectedStory.id, chapters)}
          onUpdateStoryContent={(content) => updateStoryContent(selectedStory.id, content)}
          onUpdateChapterContent={(cid, content) => updateChapterContent(selectedStory.id, cid, content)}
          onUpdateChapterSummary={(cid, summary) => updateChapter(selectedStory.id, cid, { summary })}
          onAddMemory={addMemory}
          onUpdateMemory={updateMemory}
          onRemoveMemory={removeMemory}
          onSetMemories={setStoryMemories}
        />
      )}

      {storyModal.open && (
        <StoryModal
          mode={storyModal.mode}
          story={storyModal.mode === "edit" ? selectedStory : null}
          onSave={(data) => {
            if (storyModal.mode === "create") addStory(data);
            else updateStory(selectedStory.id, data);
            setStoryModal({ open: false, mode: "create" });
          }}
          onClose={() => setStoryModal({ open: false, mode: "create" })}
        />
      )}

      {chapterModal.open && selectedStory && (
        <ChapterModal
          chapter={chapterModal.chapterId ? selectedStory.chapters.find(c => c.id === chapterModal.chapterId) : null}
          onSave={(data) => {
            if (chapterModal.chapterId) updateChapter(selectedStory.id, chapterModal.chapterId, data);
            else addChapter(selectedStory.id, data);
            setChapterModal({ open: false, chapterId: null });
          }}
          onClose={() => setChapterModal({ open: false, chapterId: null })}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          destructive
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
