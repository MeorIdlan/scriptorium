import { useState, useRef, useEffect } from "react";
import {
  GENRES, WRITING_STYLES, POV_OPTIONS, TONE_OPTIONS,
  STORY_TYPES, LENGTHS, THEMES, SETTINGS,
} from "../../constants/generator";
import { buildPrompt, buildLLMUserMessage, PROMPT_GENERATOR_SYSTEM_PROMPT, resolvePromptTemplate } from "../../lib/promptBuilder";
import { hasApiKey, callLLM, callLLMStreaming } from "../../services/llmApi";
import Tag from "../../components/Tag";
import Section from "../../components/Section";
import TypeCard from "../../components/TypeCard";
import { inputStyle } from "../../components/styles";

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

const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function PromptGenerator({ settings, onSendToForge }) {
  const [genre, setGenre]                     = useState("");
  const [style, setStyle]                     = useState("");
  const [pov, setPov]                         = useState("");
  const [tone, setTone]                       = useState("");
  const [storyType, setStoryType]             = useState("oneshot");
  const [length, setLength]                   = useState("short");
  const [themes, setThemes]                   = useState([]);
  const [customTheme, setCustomTheme]         = useState("");
  const [setting, setSetting]                 = useState("");
  const [customSetting, setCustomSetting]     = useState("");
  const [protagonist, setProtagonist]         = useState("");
  const [premise, setPremise]                 = useState("");
  const [storyGuide, setStoryGuide]           = useState("");
  const [previousChapter, setPreviousChapter] = useState("");
  const [chapterNumber, setChapterNumber]     = useState(2);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied]                   = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState("");
  const [validationMsg, setValidationMsg]     = useState("");
  const [history, setHistory]                 = useState([]); // session-only: { id, text, label }
  const [showHistory, setShowHistory]         = useState(false);

  const lastModeRef        = useRef("template"); // "llm" | "template"
  const abortRef           = useRef(null);
  const outputRef          = useRef(null);
  const lastSyncedPrompt   = useRef("");

  // Sync generated prompt into the contentEditable div.
  // We manage DOM content directly so React never touches its children.
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    if (isLoading) {
      // During generation the div is non-editable; always keep it current.
      if (el.innerText !== generatedPrompt) el.innerText = generatedPrompt;
      lastSyncedPrompt.current = generatedPrompt;
    } else if (generatedPrompt !== lastSyncedPrompt.current) {
      // External change (reset / regenerate result) — update DOM.
      el.innerText = generatedPrompt;
      lastSyncedPrompt.current = generatedPrompt;
    }
  }, [generatedPrompt, isLoading]);

  const toggleTheme = (t) =>
    setThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const effectiveSetting = SETTINGS.includes(setting) ? setting : customSetting;

  const getParams = () => ({
    genre, style, pov, tone,
    setting: effectiveSetting,
    themes, customTheme, protagonist, premise, storyGuide,
    storyType, length, chapterNumber, previousChapter,
  });

  // Push a finished prompt onto the session history shelf (most-recent first, capped).
  const pushHistory = (text, params) => {
    const clean = (text || "").trim();
    if (!clean) return;
    const label = [params.genre, params.setting].filter(Boolean).join(" · ")
      || params.storyGuide?.slice(0, 40)
      || params.premise?.slice(0, 40)
      || "Untitled prompt";
    setHistory(prev => [
      { id: Date.now().toString(), text: clean, label },
      ...prev.filter(h => h.text !== clean),
    ].slice(0, 10));
  };

  const runGenerate = async (overrideParams) => {
    const params = overrideParams || getParams();

    if (!params.genre && !params.style && !params.premise && !params.setting && !params.storyGuide && !params.protagonist) {
      setValidationMsg("Pick at least a genre, style, or setting — or enter a premise or story direction.");
      return;
    }
    setValidationMsg("");

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();

    if (hasApiKey(settings)) {
      lastModeRef.current = "llm";
      setIsLoading(true);
      setError("");
      setGeneratedPrompt("");

      const userMessage = buildLLMUserMessage(params);
      const useStreaming = settings.generatorStreaming ?? true;
      const controller = new AbortController();
      abortRef.current = controller;

      const customTemplate = (settings.generatorSystemPrompt || "").trim();
      const systemPrompt = customTemplate
        ? resolvePromptTemplate(customTemplate, params)
        : PROMPT_GENERATOR_SYSTEM_PROMPT;

      let acc = "";
      try {
        if (useStreaming) {
          await callLLMStreaming(
            settings,
            systemPrompt,
            userMessage,
            (chunk) => {
              if (!controller.signal.aborted) {
                acc += chunk;
                setGeneratedPrompt(prev => prev + chunk);
              }
            },
            controller.signal,
          );
        } else {
          acc = await callLLM(settings, systemPrompt, userMessage);
          if (!controller.signal.aborted) setGeneratedPrompt(acc);
        }
        if (!controller.signal.aborted) pushHistory(acc, params);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message);
          setGeneratedPrompt("");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          abortRef.current = null;
        }
      }
    } else {
      lastModeRef.current = "template";
      setError("");
      const built = buildPrompt(params);
      setGeneratedPrompt(built);
      pushHistory(built, params);
    }
  };

  const handleGenerate = () => runGenerate();

  // Randomize the core creative dials and immediately generate.
  const handleSurpriseMe = () => {
    const themePool = [...THEMES];
    const themeCount = 1 + Math.floor(Math.random() * 2); // 1–2 themes
    const picked = [];
    for (let i = 0; i < themeCount && themePool.length; i++) {
      picked.push(themePool.splice(Math.floor(Math.random() * themePool.length), 1)[0]);
    }
    const g = randomPick(GENRES);
    const s = randomPick(WRITING_STYLES);
    const p = randomPick(POV_OPTIONS);
    const tn = randomPick(TONE_OPTIONS);
    const st = randomPick(SETTINGS);
    const ln = randomPick(LENGTHS).id;

    const st2 = randomPick(["oneshot", "chapter"]);

    setGenre(g); setStyle(s); setPov(p); setTone(tn);
    setSetting(st); setCustomSetting(""); setThemes(picked); setLength(ln);
    setStoryType(st2);
    setValidationMsg("");
  };

  const handleRegenerate = () => {
    if (lastModeRef.current === "llm" && hasApiKey(settings)) {
      runGenerate();
    } else {
      const params = getParams();
      if (!genre && !style && !premise && !effectiveSetting && !storyGuide && !protagonist) return;
      setGeneratedPrompt(buildPrompt(params));
      lastModeRef.current = "template";
    }
  };

  const handleCopy = () => {
    const text = outputRef.current?.innerText ?? generatedPrompt;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setGenre(""); setStyle(""); setPov(""); setTone("");
    setStoryType("oneshot"); setLength("short"); setThemes([]);
    setCustomTheme(""); setSetting(""); setCustomSetting("");
    setProtagonist(""); setPremise(""); setStoryGuide("");
    setPreviousChapter(""); setChapterNumber(2);
    setGeneratedPrompt(""); setError(""); setIsLoading(false);
    setValidationMsg("");
    lastModeRef.current = "template";
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
  };

  const restoreFromHistory = (item) => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setIsLoading(false);
    setError("");
    setGeneratedPrompt(item.text);
    lastSyncedPrompt.current = item.text;
    if (outputRef.current) outputRef.current.innerText = item.text;
  };

  const textareaStyle = { ...inputStyle, resize: "vertical" };

  const isStreaming = isLoading && (settings?.generatorStreaming ?? true) && hasApiKey(settings);
  const usingLLM = hasApiKey(settings);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 32px 80px", display: "flex", gap: "32px", alignItems: "flex-start" }}>

      {/* ── LEFT PANEL — Controls ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        <Section title="Story Direction (optional)">
          <textarea
            rows={3}
            placeholder="Describe in your own words what you want this story to be about. Guide the AI with your vision — e.g. 'A slow-burn enemies-to-lovers story set in a dying empire, focusing on the moment two rivals are forced to work together to stop a coup.'"
            value={storyGuide}
            onChange={e => setStoryGuide(e.target.value)}
            style={{ ...textareaStyle, lineHeight: "1.65" }}
          />
          <div style={{ fontSize: "11px", color: "#6a6a82", marginTop: "6px", letterSpacing: "0.02em" }}>
            This becomes the primary directive in your prompt, overriding the AI's default creative choices.
          </div>
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>

          {/* ── LEFT COLUMN ── */}
          <div>
            <Section title="Story Format">
              <div style={{ display: "flex", gap: "8px" }}>
                {STORY_TYPES.map(t => (
                  <TypeCard key={t.id} item={t} selected={storyType === t.id} onClick={() => setStoryType(t.id)} />
                ))}
              </div>
              {storyType === "continue" && (
                <div style={{ marginTop: "14px" }}>
                  <label style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#5a5a72", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                    Chapter Number
                  </label>
                  <input
                    type="number" min={2} value={chapterNumber}
                    onChange={e => setChapterNumber(Number(e.target.value))}
                    style={{ ...inputStyle, width: "80px" }}
                  />
                  <label style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#5a5a72", textTransform: "uppercase", display: "block", margin: "12px 0 6px" }}>
                    Previous Chapter Summary or Content
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Paste a summary or the previous chapter's text here..."
                    value={previousChapter}
                    onChange={e => setPreviousChapter(e.target.value)}
                    style={textareaStyle}
                  />
                </div>
              )}
            </Section>

            <Section title="Target Length">
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {LENGTHS.map(l => (
                  <TypeCard key={l.id} item={l} selected={length === l.id} onClick={() => setLength(l.id)} />
                ))}
              </div>
            </Section>

            <Section title="Genre">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {GENRES.map(g => (
                  <Tag key={g} label={g} selected={genre === g} onClick={() => setGenre(genre === g ? "" : g)} />
                ))}
              </div>
            </Section>

            <Section title="Writing Style">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {WRITING_STYLES.map(s => (
                  <Tag key={s} label={s} selected={style === s} onClick={() => setStyle(style === s ? "" : s)} />
                ))}
              </div>
            </Section>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div>
            <Section title="Point of View">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {POV_OPTIONS.map(p => (
                  <Tag key={p} label={p} selected={pov === p} onClick={() => setPov(pov === p ? "" : p)} />
                ))}
              </div>
            </Section>

            <Section title="Tone">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {TONE_OPTIONS.map(t => (
                  <Tag key={t} label={t} selected={tone === t} onClick={() => setTone(tone === t ? "" : t)} />
                ))}
              </div>
            </Section>

            <Section title="Setting">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {SETTINGS.map(s => (
                  <Tag key={s} label={s} selected={setting === s} onClick={() => { setSetting(setting === s ? "" : s); setCustomSetting(""); }} />
                ))}
              </div>
              <input
                type="text"
                placeholder="Or describe your own setting..."
                value={customSetting}
                onChange={e => { setCustomSetting(e.target.value); setSetting(""); }}
                style={{ ...inputStyle, marginTop: "10px" }}
              />
            </Section>

            <Section title="Themes (pick any)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {THEMES.map(t => (
                  <Tag key={t} label={t} selected={themes.includes(t)} onClick={() => toggleTheme(t)} />
                ))}
              </div>
              <input
                type="text"
                placeholder="Or add your own theme..."
                value={customTheme}
                onChange={e => setCustomTheme(e.target.value)}
                style={{ ...inputStyle, marginTop: "10px" }}
              />
            </Section>

            <Section title="Protagonist">
              <textarea
                rows={2}
                placeholder="e.g. A disgraced knight haunted by a choice she made years ago..."
                value={protagonist}
                onChange={e => setProtagonist(e.target.value)}
                style={textareaStyle}
              />
            </Section>

            <Section title="Core Premise">
              <textarea
                rows={3}
                placeholder="What's the central conflict, idea, or inciting event? The more specific, the richer the prompt."
                value={premise}
                onChange={e => setPremise(e.target.value)}
                style={textareaStyle}
              />
            </Section>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — Generated output ── */}
      <div style={{
        width: "400px", flexShrink: 0,
        position: "sticky", top: "24px",
        maxHeight: "calc(100vh - 120px)",
        display: "flex", flexDirection: "column",
        gap: "16px",
      }}>
        {/* Generate / Reset */}
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
            {isLoading ? (usingLLM ? "Generating…" : "Building…") : "✦ Generate Prompt"}
          </button>
          {isLoading && usingLLM ? (
            <button onClick={handleStop} style={{
              background: "transparent", color: "#f87171",
              border: "1.5px solid #3a1e1e", borderRadius: "6px",
              padding: "14px 18px", fontSize: "12px",
              fontFamily: "'Georgia', serif", cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              Stop
            </button>
          ) : (
            <button onClick={handleReset} style={{
              background: "transparent", color: "#5a5a72",
              border: "1.5px solid #2e2e3a", borderRadius: "6px",
              padding: "14px 18px", fontSize: "12px",
              fontFamily: "'Georgia', serif", cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              Reset
            </button>
          )}
        </div>

        {/* Surprise Me — randomize the dials and generate */}
        <button
          onClick={handleSurpriseMe}
          disabled={isLoading}
          style={{
            background: "transparent",
            color: isLoading ? "#4a4a60" : "#a99066",
            border: "1.5px dashed #3a3a50", borderRadius: "6px",
            padding: "11px 18px", fontSize: "12px",
            fontFamily: "'Georgia', serif", cursor: isLoading ? "default" : "pointer",
            letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.2s",
          }}
        >
          🎲 Surprise Me
        </button>

        {validationMsg && (
          <div style={{ fontSize: "12px", color: "#d99", lineHeight: "1.5" }}>
            {validationMsg}
          </div>
        )}

        {/* Mode badge */}
        {usingLLM && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
            <span style={{ fontSize: "11px", color: "#4a6a4a", fontFamily: "'Georgia', serif", letterSpacing: "0.06em" }}>
              AI-powered via {settings.provider === "claude" ? "Claude" : "OpenAI"}
              {" · "}
              {settings.provider === "claude" ? settings.claudeModel : settings.openaiModel}
            </span>
          </div>
        )}

        {/* Output box — flex column so action bar stays pinned at bottom */}
        <div style={{
          flex: 1, minHeight: 0,
          background: "linear-gradient(180deg, #12121e 0%, #0f0f19 100%)",
          border: `1px solid ${(generatedPrompt || isLoading) ? "#2e2e3a" : "#1e1e2a"}`,
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
            ) : isLoading && !generatedPrompt ? (
              <ThreeDots />
            ) : generatedPrompt ? (
              <>
                <div style={{ padding: "20px 28px 10px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase" }}>
                    ✦ Generated Prompt
                  </span>
                  {isStreaming && (
                    <span style={{ fontSize: "9px", color: "#7a6a40", letterSpacing: "0.1em" }}>● streaming</span>
                  )}
                </div>
                <div
                  ref={outputRef}
                  contentEditable={!isLoading}
                  suppressContentEditableWarning
                  onInput={e => {
                    const text = e.currentTarget.innerText;
                    lastSyncedPrompt.current = text;
                    setGeneratedPrompt(text);
                  }}
                  style={{
                    color: "#d8d0c0", fontSize: "14px", lineHeight: "1.85",
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
                <div style={{ fontSize: "24px", marginBottom: "14px", color: "#1e1e2a" }}>✦</div>
                <div style={{ fontSize: "13px", color: "#6a6a82", lineHeight: "1.7", fontFamily: "'Georgia', serif" }}>
                  Configure your story parameters on the left, then click Generate Prompt.
                </div>
                {!usingLLM && (
                  <div style={{ marginTop: "14px", fontSize: "11px", color: "#5a5a72", lineHeight: "1.6" }}>
                    Add an API key in Settings to enable AI-powered generation.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action bar — pinned at bottom, only when there's content */}
          {generatedPrompt && (
            <div style={{
              flexShrink: 0,
              borderTop: "1px solid #1e1e2a",
              padding: "10px 16px",
              display: "flex", gap: "8px", justifyContent: "flex-end",
              background: "#0f0f19",
            }}>
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
              <button onClick={handleRegenerate} disabled={isLoading} style={{
                background: "transparent",
                border: "1.5px solid #3a3a50", borderRadius: "4px",
                color: isLoading ? "#3a3a50" : "#7a7a95",
                padding: "6px 16px", fontSize: "11px",
                letterSpacing: "0.1em", textTransform: "uppercase",
                cursor: isLoading ? "default" : "pointer",
                fontFamily: "'Georgia', serif", transition: "all 0.2s",
              }}>
                Regenerate
              </button>
              {onSendToForge && !isLoading && (
                <button
                  onClick={() => onSendToForge(outputRef.current?.innerText ?? generatedPrompt)}
                  style={{
                    background: "rgba(201,169,110,0.1)",
                    border: "1.5px solid rgba(201,169,110,0.4)", borderRadius: "4px",
                    color: "#c9a96e",
                    padding: "6px 16px", fontSize: "11px",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s",
                  }}
                >
                  ✦ Story Forge
                </button>
              )}
            </div>
          )}
        </div>

        {/* History shelf — session-only list of generated prompts */}
        {history.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: "1px solid #1e1e2a", paddingTop: "12px" }}>
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{
                background: "transparent", border: "none", color: "#8a8aa5",
                cursor: "pointer", fontSize: "11px", letterSpacing: "0.1em",
                textTransform: "uppercase", fontFamily: "'Georgia', serif", padding: 0,
              }}
            >
              {showHistory ? "▾" : "▸"} History ({history.length})
            </button>
            {showHistory && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", maxHeight: "220px", overflowY: "auto" }}>
                {history.map(item => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #2e2e3a", borderRadius: "6px",
                      padding: "10px 12px", background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#a99066", letterSpacing: "0.04em", marginBottom: "4px", textTransform: "uppercase" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9a9ab0", lineHeight: "1.5", marginBottom: "8px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {item.text}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => restoreFromHistory(item)}
                        style={{ background: "transparent", border: "1.5px solid #2e2e3a", borderRadius: "4px", color: "#8a8aa5", padding: "4px 12px", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', serif" }}
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(item.text); }}
                        style={{ background: "transparent", border: "1.5px solid #2e2e3a", borderRadius: "4px", color: "#8a8aa5", padding: "4px 12px", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', serif" }}
                      >
                        Copy
                      </button>
                      {onSendToForge && (
                        <button
                          onClick={() => onSendToForge(item.text)}
                          style={{ background: "rgba(201,169,110,0.1)", border: "1.5px solid rgba(201,169,110,0.4)", borderRadius: "4px", color: "#c9a96e", padding: "4px 12px", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', serif" }}
                        >
                          ✦ Forge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
