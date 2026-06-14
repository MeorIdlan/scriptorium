import { useState, useEffect } from "react";
import * as api from "../services/api";

export function useStories() {
  const [stories, setStories] = useState([]);

  useEffect(() => {
    api.getStories().then(setStories).catch(() => {});
  }, []);

  const addStory = (data) => {
    const id = Date.now().toString();
    const story = { id, content: "", chapters: [], memories: [], createdAt: new Date().toISOString(), ...data };
    setStories(prev => [...prev, story]);
    api.createStory(story).catch(() => {});
    return id;
  };

  const updateStory = (id, data) => {
    setStories(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    api.updateStory(id, data).catch(() => {});
  };

  const removeStory = (id) => {
    setStories(prev => prev.filter(s => s.id !== id));
    api.deleteStory(id).catch(() => {});
  };

  const addChapter = (storyId, data) => {
    const chapter = { id: Date.now().toString(), content: "", summary: "", ...data };
    setStories(prev => prev.map(s =>
      s.id === storyId ? { ...s, chapters: [...s.chapters, chapter] } : s
    ));
    api.createChapter(storyId, chapter).catch(() => {});
  };

  const updateChapter = (storyId, chapterId, data) => {
    setStories(prev => prev.map(s =>
      s.id !== storyId ? s
        : { ...s, chapters: s.chapters.map(c => c.id === chapterId ? { ...c, ...data } : c) }
    ));
    api.updateChapter(storyId, chapterId, data).catch(() => {});
  };

  const removeChapter = (storyId, chapterId) => {
    setStories(prev => prev.map(s =>
      s.id !== storyId ? s : { ...s, chapters: s.chapters.filter(c => c.id !== chapterId) }
    ));
    api.deleteChapter(storyId, chapterId).catch(() => {});
  };

  const reorderChapters = (storyId, chapters) => {
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, chapters } : s));
    api.updateStory(storyId, { chapters }).catch(() => {});
  };

  const updateStoryContent = (storyId, content) => {
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, content } : s));
    api.updateStoryContent(storyId, content).catch(() => {});
  };

  const updateChapterContent = (storyId, chapterId, content) => {
    setStories(prev => prev.map(s =>
      s.id !== storyId ? s
        : { ...s, chapters: s.chapters.map(c => c.id === chapterId ? { ...c, content } : c) }
    ));
    api.updateChapterContent(storyId, chapterId, content).catch(() => {});
  };

  const addMemory = (storyId, data) => {
    const memory = { id: Date.now().toString(), ...data };
    setStories(prev => prev.map(s =>
      s.id === storyId ? { ...s, memories: [...(s.memories || []), memory] } : s
    ));
    api.addMemory(storyId, memory).catch(() => {});
  };

  const updateMemory = (storyId, memoryId, data) => {
    setStories(prev => prev.map(s =>
      s.id !== storyId ? s
        : { ...s, memories: (s.memories || []).map(m => m.id === memoryId ? { ...m, ...data } : m) }
    ));
    api.updateMemory(storyId, memoryId, data).catch(() => {});
  };

  const removeMemory = (storyId, memoryId) => {
    setStories(prev => prev.map(s =>
      s.id !== storyId ? s
        : { ...s, memories: (s.memories || []).filter(m => m.id !== memoryId) }
    ));
    api.deleteMemory(storyId, memoryId).catch(() => {});
  };

  const setStoryMemories = (storyId, memories) => {
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, memories } : s));
    api.setMemories(storyId, memories).catch(() => {});
  };

  return {
    stories,
    addStory, updateStory, removeStory,
    addChapter, updateChapter, removeChapter, reorderChapters,
    updateStoryContent, updateChapterContent,
    addMemory, updateMemory, removeMemory, setStoryMemories,
  };
}
