import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { hasApiKey, callLLM, callLLMStreaming } from "../../services/llmApi";
import { inputStyle } from "../../components/styles";
import { buildForgeAppendix } from "../../lib/storyMemory";

const STORY_FORGE_SYSTEM_PROMPT = `You are a skilled creative fiction writer. Write a compelling story based on the provided writing prompt.

Focus on:
- Vivid, immersive prose that draws the reader in immediately
- Well-developed characters with distinct voices and motivations
- A clear narrative arc with setup, tension, and resolution
- Sensory details that bring scenes and settings to life
- Natural, authentic dialogue when appropriate

Deliver only the story text — no preamble, no meta-commentary, no "here is your story" framing. Begin immediately with the narrative.`;

const STORY_STATUSES = [
  { id: "planning",  label: "Planning" },
  { id: "drafting",  label: "Drafting" },
  { id: "on-hiatus", label: "On Hiatus" },
  { id: "complete",  label: "Complete" },
];

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function ThreeDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 3), 480);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: "7px", height: "7px", borderRadius: "50%",
          background: frame === i ? "#c9a96e" : "#2e2e3a",
          transition: "background 0.25s, transform 0.25s",
          transform: frame === i ? "translateY(-5px)" : "translateY(0)",
        }} />
      ))}
    </div>
  );
}

// Modal for choosing how to add the story to the tracker
function AddToTrackerModal({ story, stories, addStory, addChapter, onClose, onSuccess }) {
  const [step, setStep] = useState("choose"); // "choose" | "new-story" | "pick-story" | "chapter-form"
  const [newTitle, setNewTitle]   = useState("");
  const [newType, setNewType]     = useState("oneshot");
  const [newStatus, setNewStatus] = useState("drafting");
  const [pickedStoryId, setPickedStoryId] = useState(null);
  const [chapterTitle, setChapterTitle]   = useState("Chapter 1");

  const serializedStories = stories.filter(s => s.type === "serialized");

  const handleCreateStory = () => {
    if (!newTitle.trim()) return;
    const wc = wordCount(story);
    if (newType === "oneshot") {
      addStory({
        title: newTitle.trim(),
        type: "oneshot",
        status: newStatus,
        genres: [],
        wordCountCurrent: wc,
        wordCountTarget: 0,
        synopsis: "",
        content: story,
        chapters: [],
      });
    } else {
      const id = addStory({
        title: newTitle.trim(),
        type: "serialized",
        status: newStatus,
        genres: [],
        wordCountCurrent: wc,
        wordCountTarget: 0,
        synopsis: "",
        content: "",
        chapters: [],
      });
      if (id) {
        addChapter(id, {
          title: chapterTitle.trim() || "Chapter 1",
          status: "draft",
          wordCount: wc,
          content: story,
        });
      }
    }
    onSuccess();
  };

  const handleAddChapter = () => {
    if (!pickedStoryId || !chapterTitle.trim()) return;
    const wc = wordCount(story);
    addChapter(pickedStoryId, {
      title: chapterTitle.trim(),
      status: "draft",
      wordCount: wc,
      content: story,
    });
    onSuccess();
  };

  const overlay = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
  };

  const modal = {
    background: "#12121e", border: "1px solid #2e2e3a", borderRadius: "12px",
    padding: "32px", width: "100%", maxWidth: "480px",
    fontFamily: "'Georgia', serif",
  };

  const labelSt = {
    display: "block", fontSize: "11px", letterSpacing: "0.1em",
    color: "#5a5a72", textTransform: "uppercase", marginBottom: "8px",
  };

  const typeBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setNewType(id)}
      style={{
        flex: 1, padding: "10px", borderRadius: "6px", cursor: "pointer",
        border: newType === id ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
        background: newType === id ? "rgba(201,169,110,0.1)" : "rgba(255,255,255,0.02)",
        color: newType === id ? "#c9a96e" : "#5a5a72",
        fontSize: "13px", fontFamily: "'Georgia', serif", transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );

  const primaryAction = {
    background: "linear-gradient(135deg, #b8923a 0%, #c9a96e 50%, #d4b87a 100%)",
    color: "#1a1208", border: "none", borderRadius: "6px",
    padding: "11px 28px", fontSize: "12px",
    fontFamily: "'Georgia', serif", fontWeight: "bold",
    cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
  };

  const cancelAction = {
    background: "transparent", border: "1.5px solid #2e2e3a", borderRadius: "6px",
    color: "#5a5a72", padding: "11px 22px", fontSize: "12px",
    fontFamily: "'Georgia', serif", cursor: "pointer", letterSpacing: "0.06em",
  };

  return createPortal(
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>

        {step === "choose" && (
          <>
            <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "8px" }}>
              ✦ Add to Story Tracker
            </div>
            <div style={{ fontSize: "20px", color: "#e8e0d0", marginBottom: "24px" }}>
              Where should this go?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              <button
                onClick={() => setStep("new-story")}
                style={{
                  padding: "16px 20px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
                  background: "rgba(201,169,110,0.05)", border: "1.5px solid #2e2e3a",
                  color: "#c8c0b0", fontFamily: "'Georgia', serif", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#c9a96e"; e.currentTarget.style.background = "rgba(201,169,110,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#2e2e3a"; e.currentTarget.style.background = "rgba(201,169,110,0.05)"; }}
              >
                <div style={{ fontSize: "14px", fontWeight: "normal", marginBottom: "4px", color: "#e8e0d0" }}>
                  Create New Story
                </div>
                <div style={{ fontSize: "12px", color: "#5a5a72", lineHeight: "1.55" }}>
                  Save this draft as a new entry in your tracker.
                </div>
              </button>
              <button
                onClick={() => {
                  if (serializedStories.length === 0) {
                    setPickedStoryId(null);
                  }
                  setStep("pick-story");
                }}
                style={{
                  padding: "16px 20px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
                  background: "rgba(201,169,110,0.05)", border: "1.5px solid #2e2e3a",
                  color: "#c8c0b0", fontFamily: "'Georgia', serif", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#c9a96e"; e.currentTarget.style.background = "rgba(201,169,110,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#2e2e3a"; e.currentTarget.style.background = "rgba(201,169,110,0.05)"; }}
              >
                <div style={{ fontSize: "14px", fontWeight: "normal", marginBottom: "4px", color: "#e8e0d0" }}>
                  Add to Existing Story as Chapter
                </div>
                <div style={{ fontSize: "12px", color: "#5a5a72", lineHeight: "1.55" }}>
                  Append this draft as a new chapter to a serialized story.
                  {serializedStories.length === 0 && " (No serialized stories yet)"}
                </div>
              </button>
            </div>
            <button onClick={onClose} style={cancelAction}>Cancel</button>
          </>
        )}

        {step === "new-story" && (
          <>
            <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "8px" }}>
              ✦ New Story
            </div>
            <div style={{ fontSize: "20px", color: "#e8e0d0", marginBottom: "24px" }}>Create Story</div>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelSt}>Story Title</label>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateStory()}
                placeholder="Enter a title…"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelSt}>Story Type</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {typeBtn("oneshot", "One-shot")}
                {typeBtn("serialized", "Serialized")}
              </div>
            </div>

            {newType === "serialized" && (
              <div style={{ marginBottom: "18px" }}>
                <label style={labelSt}>First Chapter Title</label>
                <input
                  type="text"
                  value={chapterTitle}
                  onChange={e => setChapterTitle(e.target.value)}
                  placeholder="Chapter 1"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </div>
            )}

            <div style={{ marginBottom: "24px" }}>
              <label style={labelSt}>Status</label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {STORY_STATUSES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setNewStatus(s.id)}
                    style={{
                      padding: "6px 14px", borderRadius: "4px", cursor: "pointer",
                      border: newStatus === s.id ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
                      background: newStatus === s.id ? "rgba(201,169,110,0.1)" : "transparent",
                      color: newStatus === s.id ? "#c9a96e" : "#5a5a72",
                      fontSize: "12px", fontFamily: "'Georgia', serif", transition: "all 0.15s",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep("choose")} style={cancelAction}>← Back</button>
              <button
                onClick={handleCreateStory}
                disabled={!newTitle.trim()}
                style={{ ...primaryAction, opacity: newTitle.trim() ? 1 : 0.4, cursor: newTitle.trim() ? "pointer" : "default" }}
              >
                Add to Tracker
              </button>
            </div>
          </>
        )}

        {step === "pick-story" && (
          <>
            <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "8px" }}>
              ✦ Add Chapter
            </div>
            <div style={{ fontSize: "20px", color: "#e8e0d0", marginBottom: "24px" }}>Pick a Story</div>

            {serializedStories.length === 0 ? (
              <div style={{ color: "#5a5a72", fontSize: "13px", marginBottom: "24px", lineHeight: "1.6" }}>
                You don't have any serialized stories yet. Create one first via "Create New Story".
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px", maxHeight: "240px", overflowY: "auto" }}>
                {serializedStories.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setPickedStoryId(s.id)}
                    style={{
                      padding: "12px 16px", borderRadius: "6px", cursor: "pointer", textAlign: "left",
                      border: pickedStoryId === s.id ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
                      background: pickedStoryId === s.id ? "rgba(201,169,110,0.1)" : "rgba(255,255,255,0.02)",
                      color: pickedStoryId === s.id ? "#c9a96e" : "#c8c0b0",
                      fontFamily: "'Georgia', serif", fontSize: "14px", transition: "all 0.15s",
                    }}
                  >
                    <div style={{ marginBottom: "2px" }}>{s.title}</div>
                    <div style={{ fontSize: "11px", color: "#5a5a72" }}>
                      {s.chapters.length} chapter{s.chapters.length !== 1 ? "s" : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep("choose")} style={cancelAction}>← Back</button>
              {pickedStoryId && (
                <button onClick={() => setStep("chapter-form")} style={primaryAction}>
                  Next →
                </button>
              )}
            </div>
          </>
        )}

        {step === "chapter-form" && (
          <>
            <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "8px" }}>
              ✦ Add Chapter
            </div>
            <div style={{ fontSize: "20px", color: "#e8e0d0", marginBottom: "8px" }}>Chapter Details</div>
            <div style={{ fontSize: "13px", color: "#5a5a72", marginBottom: "24px" }}>
              Adding to: <span style={{ color: "#c8c0b0" }}>{stories.find(s => s.id === pickedStoryId)?.title}</span>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={labelSt}>Chapter Title</label>
              <input
                autoFocus
                type="text"
                value={chapterTitle}
                onChange={e => setChapterTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddChapter()}
                placeholder="Chapter title…"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep("pick-story")} style={cancelAction}>← Back</button>
              <button
                onClick={handleAddChapter}
                disabled={!chapterTitle.trim()}
                style={{ ...primaryAction, opacity: chapterTitle.trim() ? 1 : 0.4, cursor: chapterTitle.trim() ? "pointer" : "default" }}
              >
                Add Chapter
              </button>
            </div>
          </>
        )}

      </div>
    </div>,
    document.body
  );
}

export default function StoryForge({ settings, initialPrompt, onPromptConsumed, stories, addStory, addChapter, onGoToTracker }) {
  const [prompt, setPrompt]               = useState(initialPrompt || "");
  const [generatedStory, setGeneratedStory] = useState("");
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState("");
  const [copied, setCopied]               = useState(false);
  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [addSuccess, setAddSuccess]       = useState(false);

  // Story link — attach a tracked story's memories/summaries as an appendix.
  const [linkedStoryId, setLinkedStoryId]       = useState("");
  const [excludedMemoryIds, setExcludedMemoryIds] = useState([]);
  const [includeSummaries, setIncludeSummaries]   = useState(true);

  const [leftVisible, setLeftVisible] = useState(true);

  const abortRef   = useRef(null);
  const outputRef  = useRef(null);
  const lastSynced = useRef("");

  // When a prompt is sent from Prompt Generator, update local state once
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setPrompt(initialPrompt);
      onPromptConsumed?.();
    }
  }, [initialPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync generated story into contentEditable div
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    if (isLoading) {
      if (el.innerText !== generatedStory) el.innerText = generatedStory;
      lastSynced.current = generatedStory;
    } else if (generatedStory !== lastSynced.current) {
      el.innerText = generatedStory;
      lastSynced.current = generatedStory;
    }
  }, [generatedStory, isLoading]);


  const linkedStory = stories.find(s => s.id === linkedStoryId) || null;

  // Assemble the full prompt, appending the linked story's memories/summaries.
  const buildFinalPrompt = () => {
    if (!linkedStory) return prompt;
    const memories = (linkedStory.memories || []).filter(m => !excludedMemoryIds.includes(m.id));
    const summaries = includeSummaries
      ? (linkedStory.chapters || [])
          .map((c, i) => ({ label: c.title || `Chapter ${i + 1}`, text: c.summary || "" }))
          .filter(s => s.text.trim())
      : [];
    return prompt + buildForgeAppendix({ memories, summaries });
  };

  const handleGenerate = async () => {
    if (!hasApiKey(settings)) {
      setError("An API key is required to generate stories. Open Settings to add your key.");
      return;
    }

    if (abortRef.current) abortRef.current.abort();

    if (settings.forgePanelSlide !== false) setLeftVisible(false);
    setIsLoading(true);
    setError("");
    setGeneratedStory("");
    setAddSuccess(false);

    const controller = new AbortController();
    abortRef.current = controller;

    const useStreaming = settings.generatorStreaming ?? true;
    const systemPrompt = prompt.trim() ? buildFinalPrompt() : STORY_FORGE_SYSTEM_PROMPT;

    try {
      if (useStreaming) {
        await callLLMStreaming(
          settings,
          systemPrompt,
          "",
          (chunk) => {
            if (!controller.signal.aborted) {
              setGeneratedStory(prev => prev + chunk);
            }
          },
          controller.signal,
          "forge",
        );
      } else {
        const result = await callLLM(settings, systemPrompt, "", "forge");
        if (!controller.signal.aborted) setGeneratedStory(result);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        setGeneratedStory("");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        abortRef.current = null;
      }
    }
  };

  const handleContinue = async () => {
    if (!hasApiKey(settings)) {
      setError("An API key is required. Open Settings to add your key.");
      return;
    }

    if (abortRef.current) abortRef.current.abort();

    if (settings.forgePanelSlide !== false) setLeftVisible(false);

    const currentText = outputRef.current?.innerText || generatedStory;
    const systemPrompt = prompt.trim() ? buildFinalPrompt() : STORY_FORGE_SYSTEM_PROMPT;

    setGeneratedStory(currentText);
    lastSynced.current = currentText;
    setIsLoading(true);
    setError("");
    setAddSuccess(false);

    const controller = new AbortController();
    abortRef.current = controller;

    const useStreaming = settings.generatorStreaming ?? true;

    try {
      if (useStreaming) {
        await callLLMStreaming(
          settings,
          systemPrompt,
          "",
          (chunk) => {
            if (!controller.signal.aborted) {
              setGeneratedStory(prev => prev + chunk);
            }
          },
          controller.signal,
          "forge",
          currentText,
        );
      } else {
        const result = await callLLM(settings, systemPrompt, "", "forge", currentText);
        if (!controller.signal.aborted) setGeneratedStory(prev => prev + result);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        abortRef.current = null;
      }
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
  };

  const handleCopy = () => {
    const text = outputRef.current?.innerText ?? generatedStory;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddSuccess = () => {
    setShowTrackerModal(false);
    setAddSuccess(true);
    setTimeout(() => setAddSuccess(false), 4000);
  };

  const handleReset = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
    setPrompt("");
    setGeneratedStory("");
    setError("");
    setAddSuccess(false);
    lastSynced.current = "";
    if (outputRef.current) outputRef.current.innerText = "";
  };

  const isStreaming = isLoading && (settings?.generatorStreaming ?? true) && hasApiKey(settings);
  const currentStory = outputRef.current?.innerText ?? generatedStory;

  const labelSt = {
    fontSize: "11px", letterSpacing: "0.12em", color: "#5a5a72",
    textTransform: "uppercase", display: "block", marginBottom: "8px",
    fontFamily: "'Georgia', serif",
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 32px 80px", display: "flex", alignItems: "flex-start" }}>

      {/* ── LEFT PANEL — Prompt input ── */}
      <div style={{
        overflow: "hidden",
        width: leftVisible ? "660px" : "0px",
        flexShrink: 0,
        transition: "width 0.38s cubic-bezier(0.4,0,0.2,1)",
      }}>
      <div style={{
        width: "660px",
        paddingRight: "32px",
        boxSizing: "border-box",
        opacity: leftVisible ? 1 : 0,
        transform: leftVisible ? "translateX(0)" : "translateX(-18px)",
        transition: `opacity ${leftVisible ? "0.25s 0.06s" : "0.18s"} ease, transform 0.38s cubic-bezier(0.4,0,0.2,1)`,
        pointerEvents: leftVisible ? "auto" : "none",
      }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.22em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "10px" }}>
            ✦ Story Forge
          </div>
          <div style={{ fontSize: "22px", fontWeight: "normal", color: "#e8e0d0", letterSpacing: "-0.01em", marginBottom: "6px" }}>
            Write the Story
          </div>
          <div style={{ fontSize: "13px", color: "#5a5a72", lineHeight: "1.6" }}>
            Paste or refine your writing prompt, then let the AI draft a complete story. Edit the result and save it to your tracker.
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label style={labelSt}>Writing Prompt</label>
          <textarea
            rows={12}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Paste your writing prompt here, or describe the story you want to generate…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#0c0c14", border: "1.5px solid #2e2e3a",
              borderRadius: "6px", color: "#c8c0b0",
              padding: "14px 16px", fontSize: "14px",
              fontFamily: "'Georgia', serif", lineHeight: "1.7",
              resize: "vertical", outline: "none",
            }}
          />
        </div>

        {/* Story link — attach memories / summaries as an appendix */}
        <div style={{ marginBottom: "24px" }}>
          <label style={labelSt}>Link to a tracked story <span style={{ textTransform: "none", letterSpacing: 0, color: "#3e3e58" }}>(optional)</span></label>
          <select
            value={linkedStoryId}
            onChange={e => { setLinkedStoryId(e.target.value); setExcludedMemoryIds([]); }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">None</option>
            {stories.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>

          {linkedStory && (
            <div style={{ marginTop: "12px", border: "1px solid #2e2e3a", borderRadius: "6px", padding: "14px 16px", background: "rgba(201,169,110,0.03)" }}>
              <div style={{ fontSize: "11px", color: "#5a5a72", lineHeight: "1.6", marginBottom: "12px" }}>
                The selected items are appended to your prompt as reference context so the AI stays consistent.
              </div>

              {(linkedStory.memories || []).length === 0 ? (
                <div style={{ fontSize: "12px", color: "#5a5a72", marginBottom: "10px" }}>
                  This story has no memories yet. Generate some in the Story Tracker.
                </div>
              ) : (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.14em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "8px" }}>
                    Memories ({(linkedStory.memories || []).filter(m => !excludedMemoryIds.includes(m.id)).length}/{(linkedStory.memories || []).length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                    {(linkedStory.memories || []).map(m => {
                      const checked = !excludedMemoryIds.includes(m.id);
                      return (
                        <label key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", fontSize: "12px", color: "#c8c0b0", lineHeight: "1.5" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setExcludedMemoryIds(prev =>
                              checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                            )}
                            style={{ marginTop: "2px", accentColor: "#c9a96e", flexShrink: 0 }}
                          />
                          <span>
                            <span style={{ color: "#7a7a95", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.category}</span>
                            {" — "}
                            {m.content}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", color: "#c8c0b0" }}>
                <input
                  type="checkbox"
                  checked={includeSummaries}
                  onChange={e => setIncludeSummaries(e.target.checked)}
                  style={{ accentColor: "#c9a96e" }}
                />
                Include chapter summaries
                <span style={{ color: "#5a5a72" }}>
                  ({(linkedStory.chapters || []).filter(c => (c.summary || "").trim()).length} available)
                </span>
              </label>
            </div>
          )}
        </div>

        {/* System prompt info */}
        <div style={{
          background: "rgba(255,255,255,0.015)", border: "1px solid #1a1a26",
          borderRadius: "6px", padding: "12px 16px",
        }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.14em", color: "#3e3e58", textTransform: "uppercase", marginBottom: "6px" }}>
            Default Story Forge Prompt
          </div>
          <div style={{ fontSize: "12px", color: "#3a3a50", lineHeight: "1.6", fontFamily: "'Georgia', serif", whiteSpace: "pre-wrap" }}>
            {STORY_FORGE_SYSTEM_PROMPT}
          </div>
        </div>
      </div>
      </div>

      {/* ── RIGHT PANEL — Generated story ── */}
      <div style={{
        flex: 1, minWidth: 0,
        position: "sticky", top: "24px",
        maxHeight: "calc(100vh - 120px)",
        display: "flex", flexDirection: "column",
        gap: "16px",
      }}>

        {/* Panel toggle */}
        <div>
          <button
            onClick={() => setLeftVisible(v => !v)}
            style={{
              background: "transparent", border: "none", color: "#3e3e58",
              cursor: "pointer", fontSize: "11px", letterSpacing: "0.1em",
              textTransform: "uppercase", fontFamily: "'Georgia', serif", padding: "0",
            }}
          >
            {leftVisible ? "◀ Hide panel" : "▶ Show panel"}
          </button>
        </div>

        {/* Generate / Stop */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            style={{
              flex: 1,
              background: isLoading
                ? "rgba(201,169,110,0.15)"
                : "linear-gradient(135deg, #b8923a 0%, #c9a96e 50%, #d4b87a 100%)",
              color: isLoading ? "#c9a96e" : "#1a1208",
              border: isLoading ? "1.5px solid #c9a96e" : "none",
              borderRadius: "6px",
              padding: "14px 24px", fontSize: "14px",
              fontFamily: "'Georgia', serif", fontWeight: "bold",
              letterSpacing: "0.08em", cursor: isLoading ? "default" : "pointer",
              textTransform: "uppercase", transition: "all 0.3s",
              boxShadow: isLoading ? "none" : "0 4px 20px rgba(201,169,110,0.3)",
            }}
          >
            {isLoading ? "Generating…" : "✦ Generate Story"}
          </button>
          {isLoading && (
            <button
              onClick={handleStop}
              style={{
                background: "transparent", color: "#f87171",
                border: "1.5px solid #3a1e1e", borderRadius: "6px",
                padding: "14px 18px", fontSize: "12px",
                fontFamily: "'Georgia', serif", cursor: "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >
              Stop
            </button>
          )}
        </div>

        {/* AI mode badge */}
        {hasApiKey(settings) && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
            <span style={{ fontSize: "11px", color: "#4a6a4a", fontFamily: "'Georgia', serif", letterSpacing: "0.06em" }}>
              AI-powered via {settings.provider === "claude" ? "Claude" : "OpenAI"}
              {" · "}
              {settings.provider === "claude"
                ? (settings.claudeForgeModel || settings.claudeModel)
                : (settings.openaiForgeModel || settings.openaiModel)}
            </span>
          </div>
        )}
        {!hasApiKey(settings) && (
          <div style={{ fontSize: "12px", color: "#6a6a82", lineHeight: "1.6" }}>
            Add an API key in Settings to enable AI story generation.
          </div>
        )}

        {addSuccess && (
          <div style={{
            background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)",
            borderRadius: "6px", padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
          }}>
            <span style={{ fontSize: "13px", color: "#4ade80", fontFamily: "'Georgia', serif" }}>
              ✓ Story added to tracker!
            </span>
            <button
              onClick={onGoToTracker}
              style={{
                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)",
                borderRadius: "4px", color: "#4ade80", fontSize: "11px",
                fontFamily: "'Georgia', serif", letterSpacing: "0.08em",
                padding: "4px 12px", cursor: "pointer", textTransform: "uppercase",
              }}
            >
              View Tracker →
            </button>
          </div>
        )}

        <div style={{
          flex: 1, minHeight: 0,
          background: "linear-gradient(180deg, #12121e 0%, #0f0f19 100%)",
          border: `1px solid ${(generatedStory || isLoading) ? "#2e2e3a" : "#1e1e2a"}`,
          borderRadius: "8px",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {error ? (
              <div style={{ padding: "32px 28px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#f87171", textTransform: "uppercase", marginBottom: "12px" }}>
                  ✦ Error
                </div>
                <div style={{ color: "#f87171", fontSize: "13px", lineHeight: "1.7" }}>{error}</div>
                <div style={{ marginTop: "16px", fontSize: "12px", color: "#5a5a72" }}>
                  Check your API key in Settings and try again.
                </div>
              </div>
            ) : isLoading && !generatedStory ? (
              <ThreeDots />
            ) : generatedStory ? (
              <>
                <div style={{ padding: "20px 28px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase" }}>
                      ✦ Generated Story
                    </span>
                    {isStreaming && (
                      <span style={{ fontSize: "9px", color: "#7a6a40", letterSpacing: "0.1em" }}>● streaming</span>
                    )}
                  </div>
                  {!isLoading && (
                    <span style={{ fontSize: "11px", color: "#3a3a50" }}>
                      {wordCount(generatedStory).toLocaleString()} words
                    </span>
                  )}
                </div>
                <div
                  ref={outputRef}
                  contentEditable={!isLoading}
                  suppressContentEditableWarning
                  onInput={e => {
                    const text = e.currentTarget.innerText;
                    lastSynced.current = text;
                    setGeneratedStory(text);
                  }}
                  style={{
                    color: "#d8d0c0", fontSize: "14px", lineHeight: "1.9",
                    padding: "0 28px 24px",
                    fontFamily: "'Georgia', serif",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    outline: "none", minHeight: "80px",
                    cursor: isLoading ? "default" : "text",
                  }}
                />
              </>
            ) : (
              <div style={{ padding: "48px 28px", textAlign: "center" }}>
                <div style={{ fontSize: "32px", marginBottom: "14px", color: "#1e1e2a" }}>✦</div>
                <div style={{ fontSize: "13px", color: "#6a6a82", lineHeight: "1.7", fontFamily: "'Georgia', serif" }}>
                  Enter a prompt on the left, then click Generate Story.
                </div>
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#5a5a72", lineHeight: "1.6", fontFamily: "'Georgia', serif" }}>
                  You can also use the Prompt Generator tab to craft a detailed prompt and send it here directly.
                </div>
              </div>
            )}
          </div>

          {/* Action bar — only when content exists */}
          {generatedStory && (
            <div style={{
              flexShrink: 0,
              borderTop: "1px solid #1e1e2a",
              padding: "10px 16px",
              display: "flex", gap: "8px", alignItems: "center",
              background: "#0f0f19",
            }}>
              <button
                onClick={handleReset}
                style={{
                  background: "transparent",
                  border: "1.5px solid #2e2e3a", borderRadius: "4px",
                  color: "#5a5a72",
                  padding: "6px 16px", fontSize: "11px",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s",
                  marginRight: "auto",
                }}
              >
                Reset
              </button>
              <button onClick={handleCopy} style={{
                background: "transparent",
                border: "1.5px solid #2e2e3a", borderRadius: "4px",
                color: copied ? "#c9a96e" : "#5a5a72",
                padding: "6px 16px", fontSize: "11px",
                letterSpacing: "0.1em", textTransform: "uppercase",
                cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s",
              }}>
                {copied ? "✓ Copied!" : "Copy"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                style={{
                  background: "transparent",
                  border: "1.5px solid #3a3a50", borderRadius: "4px",
                  color: isLoading ? "#3a3a50" : "#7a7a95",
                  padding: "6px 16px", fontSize: "11px",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  cursor: isLoading ? "default" : "pointer",
                  fontFamily: "'Georgia', serif", transition: "all 0.2s",
                }}
              >
                Regenerate
              </button>
              {!isLoading && (
                <button
                  onClick={handleContinue}
                  style={{
                    background: "transparent",
                    border: "1.5px solid #3a3a50", borderRadius: "4px",
                    color: "#7a7a95",
                    padding: "6px 16px", fontSize: "11px",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s",
                  }}
                >
                  Continue
                </button>
              )}
              {!isLoading && (
                <button
                  onClick={() => setShowTrackerModal(true)}
                  style={{
                    background: "rgba(201,169,110,0.1)",
                    border: "1.5px solid rgba(201,169,110,0.4)", borderRadius: "4px",
                    color: "#c9a96e",
                    padding: "6px 16px", fontSize: "11px",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s",
                  }}
                >
                  ✓ Accept
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showTrackerModal && (
        <AddToTrackerModal
          story={currentStory}
          stories={stories}
          addStory={addStory}
          addChapter={addChapter}
          onClose={() => setShowTrackerModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}
    </div>
  );
}
