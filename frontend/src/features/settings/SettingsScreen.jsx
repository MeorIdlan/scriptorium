import { useState, useRef, useEffect } from "react";
import { inputStyle, labelStyle, ghostBtn } from "../../components/styles";
import { PROMPT_VARIABLES, PROMPT_GENERATOR_SYSTEM_PROMPT } from "../../lib/promptBuilder";
import * as api from "../../services/api";

function SectionDivider({ title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
      <span style={{
        color: "#7a7a95", fontSize: "10px", letterSpacing: "0.18em",
        textTransform: "uppercase", fontFamily: "'Georgia', serif", whiteSpace: "nowrap",
      }}>
        {title}
      </span>
      <div style={{ flex: 1, height: "1px", background: "#1e1e2a" }} />
    </div>
  );
}

function ModelSelect({ value, onChange, models }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: "pointer", appearance: "none", paddingRight: "36px" }}
      >
        {models.map(m => (
          <option key={m.id} value={m.id} style={{ background: "#12121e" }}>{m.label}</option>
        ))}
      </select>
      <span style={{
        position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
        color: "#5a5a72", pointerEvents: "none", fontSize: "10px",
      }}>▾</span>
    </div>
  );
}

const STATUS_DOT = {
  idle:    { color: "#3e3e58", glow: "none",                          label: "" },
  saving:  { color: "#c9a96e", glow: "0 0 6px #c9a96e",              label: "Saving…" },
  ok:      { color: "#4ade80", glow: "0 0 8px rgba(74,222,128,0.7)", label: "Key saved" },
  error:   { color: "#f87171", glow: "0 0 8px rgba(248,113,113,0.7)", label: "" },
};

function KeyStatusDot({ status, error }) {
  const s = STATUS_DOT[status] || STATUS_DOT.idle;
  const label = status === "error" ? (error || "Invalid key") : s.label;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "18px" }}>
      <div style={{
        width: "7px", height: "7px", borderRadius: "50%",
        background: s.color, boxShadow: s.glow,
        flexShrink: 0, transition: "all 0.3s",
      }} />
      {label && (
        <span style={{ fontSize: "11px", color: s.color, fontFamily: "'Georgia', serif", transition: "color 0.3s" }}>
          {label}
        </span>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "13px", color: "#c8c0b0", fontFamily: "'Georgia', serif", marginBottom: "4px" }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: "12px", color: "#4a4a62", lineHeight: "1.55" }}>
            {description}
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: "40px", height: "22px", borderRadius: "11px",
          background: checked ? "rgba(201,169,110,0.25)" : "rgba(255,255,255,0.04)",
          border: checked ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
          cursor: "pointer", position: "relative", transition: "all 0.2s", padding: 0,
        }}
      >
        <div style={{
          position: "absolute", top: "2px",
          left: checked ? "18px" : "2px",
          width: "14px", height: "14px", borderRadius: "50%",
          background: checked ? "#c9a96e" : "#3e3e58",
          transition: "all 0.2s",
        }} />
      </button>
    </div>
  );
}

const ghostMiniBtn = {
  background: "none", border: "1px solid #2e2e3a", borderRadius: "4px",
  color: "#7a7a95", fontSize: "10px", fontFamily: "'Georgia', serif",
  letterSpacing: "0.07em", padding: "4px 10px", cursor: "pointer",
  textTransform: "uppercase", transition: "all 0.15s",
};

function GeneratorTab({ local, update }) {
  const promptRef   = useRef(null);
  const [presets, setPresets]     = useState([]);
  const [saveName, setSaveName]   = useState("");
  const [justSaved, setJustSaved] = useState(null);

  useEffect(() => {
    api.getPresets().then(setPresets).catch(() => {});
  }, []);

  const currentPrompt = local.generatorSystemPrompt || "";
  const isCustomised  = currentPrompt.trim().length > 0;

  const insertVariable = (key) => {
    const el = promptRef.current;
    if (!el) return;
    const token = `{${key}}`;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = currentPrompt.slice(0, start) + token + currentPrompt.slice(end);
    update("generatorSystemPrompt", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleLoadDefault = () => update("generatorSystemPrompt", PROMPT_GENERATOR_SYSTEM_PROMPT);
  const handleClear       = () => update("generatorSystemPrompt", "");

  const handleLoadPreset = (preset) => {
    update("generatorSystemPrompt", preset.prompt);
    promptRef.current?.focus();
  };

  const handleDeletePreset = async (id) => {
    setPresets(prev => prev.filter(p => p.id !== id));
    await api.deletePreset(id).catch(() => {});
  };

  const handleSavePreset = async () => {
    const name = saveName.trim();
    if (!name || !isCustomised) return;
    const preset = { name, prompt: currentPrompt, createdAt: new Date().toISOString() };
    const saved = await api.createPreset(preset).catch(() => null);
    if (!saved) return;
    setPresets(prev => [...prev, saved]);
    setSaveName("");
    setJustSaved(saved.id);
    setTimeout(() => setJustSaved(null), 2000);
  };

  return (
    <div style={{ marginBottom: "28px" }}>
      <p style={{ margin: "0 0 28px", color: "#5a5a72", fontSize: "14px", lineHeight: "1.6" }}>
        Configure how the AI-powered prompt generator behaves. Requires an API key to be active.
      </p>

      <SectionDivider title="Output Behaviour" />
      <div style={{ marginBottom: "20px" }}>
        <Toggle
          checked={local.generatorStreaming ?? true}
          onChange={val => update("generatorStreaming", val)}
          label="Enable Streaming"
          description="Display the generated prompt word-by-word as it arrives from the API. When disabled, a loading animation plays until the full output is ready."
        />
      </div>
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "13px", color: "#c8c0b0", fontFamily: "'Georgia', serif", marginBottom: "4px" }}>
          Max Reply Tokens
        </div>
        <div style={{ fontSize: "12px", color: "#4a4a62", lineHeight: "1.55", marginBottom: "10px" }}>
          Maximum tokens the AI may generate per Generator request.
        </div>
        <MaxTokensSlider settingKey="generatorMaxTokens" local={local} update={update} />
      </div>

      <SectionDivider title="System Prompt" />
      <div style={{ marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ fontSize: "12px", color: "#4a4a62", lineHeight: "1.5" }}>
          {isCustomised
            ? "Using your custom prompt — variables are resolved before sending."
            : "Using built-in default — type below or load the default to customise."}
        </div>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button onClick={handleLoadDefault} style={ghostMiniBtn}>Load Default</button>
          {isCustomised && (
            <button onClick={handleClear} style={{ ...ghostMiniBtn, color: "#5a5a72" }}>Restore Default</button>
          )}
        </div>
      </div>

      <textarea
        ref={promptRef}
        rows={12}
        value={currentPrompt}
        onChange={e => update("generatorSystemPrompt", e.target.value)}
        placeholder={PROMPT_GENERATOR_SYSTEM_PROMPT}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "#0c0c14", border: "1.5px solid #2e2e3a",
          borderRadius: "6px", color: "#c8c0b0",
          padding: "12px 14px", fontSize: "13px",
          fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Mono', monospace",
          lineHeight: "1.65", resize: "vertical", outline: "none",
        }}
        spellCheck={false}
      />

      <div style={{ marginTop: "14px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.14em", color: "#5a5a72", textTransform: "uppercase", marginBottom: "8px", fontFamily: "'Georgia', serif" }}>
          Available Variables — click to insert at cursor
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {PROMPT_VARIABLES.map(v => (
            <button
              key={v.key}
              title={v.desc}
              onClick={() => insertVariable(v.key)}
              style={{
                background: "rgba(201,169,110,0.06)", border: "1px solid #2a2a3a",
                borderRadius: "4px", color: "#9a8a6a", fontSize: "11px",
                fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                padding: "3px 8px", cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.02em",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(201,169,110,0.14)";
                e.currentTarget.style.color = "#c9a96e";
                e.currentTarget.style.borderColor = "#4a4a30";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(201,169,110,0.06)";
                e.currentTarget.style.color = "#9a8a6a";
                e.currentTarget.style.borderColor = "#2a2a3a";
              }}
            >
              {`{${v.key}}`}
            </button>
          ))}
        </div>
        <div style={{ marginTop: "6px", fontSize: "11px", color: "#3a3a50", lineHeight: "1.55" }}>
          Hover a variable to see what it contains. Unknown <code style={{ fontFamily: "monospace", color: "#4a4a60" }}>{"{tokens}"}</code> are left as-is.
        </div>
      </div>

      <div style={{ marginTop: "28px" }}>
        <SectionDivider title="Saved Presets" />

        {presets.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#3a3a50", fontStyle: "italic", fontFamily: "'Georgia', serif", marginBottom: "16px" }}>
            No saved presets yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
            {presets.map(preset => (
              <div
                key={preset.id}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  background: justSaved === preset.id ? "rgba(201,169,110,0.08)" : "rgba(255,255,255,0.02)",
                  border: justSaved === preset.id ? "1px solid rgba(201,169,110,0.3)" : "1px solid #1e1e2a",
                  borderRadius: "6px", padding: "10px 12px",
                  transition: "all 0.3s",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", color: "#c8c0b0", fontFamily: "'Georgia', serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {justSaved === preset.id ? "✓ Saved!" : preset.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "#3a3a50", marginTop: "2px", fontFamily: "ui-monospace, monospace" }}>
                    {preset.prompt.slice(0, 60).replace(/\n/g, " ")}{preset.prompt.length > 60 ? "…" : ""}
                  </div>
                </div>
                <button onClick={() => handleLoadPreset(preset)} style={{ ...ghostMiniBtn, flexShrink: 0 }}>
                  Load
                </button>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  style={{
                    background: "none", border: "none", color: "#3a3a50",
                    fontSize: "14px", cursor: "pointer", padding: "2px 4px",
                    lineHeight: 1, flexShrink: 0, transition: "color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
                  onMouseLeave={e => e.currentTarget.style.color = "#3a3a50"}
                  title="Delete preset"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSavePreset()}
            placeholder="Preset name…"
            style={{
              flex: 1,
              background: "#0c0c14", border: "1.5px solid #2e2e3a",
              borderRadius: "5px", color: "#c8c0b0",
              padding: "8px 12px", fontSize: "13px",
              fontFamily: "'Georgia', serif", outline: "none",
            }}
          />
          <button
            onClick={handleSavePreset}
            disabled={!saveName.trim() || !isCustomised}
            title={!isCustomised ? "Write or load a prompt first" : ""}
            style={{
              background: saveName.trim() && isCustomised
                ? "rgba(201,169,110,0.12)"
                : "rgba(255,255,255,0.02)",
              border: saveName.trim() && isCustomised
                ? "1.5px solid rgba(201,169,110,0.4)"
                : "1.5px solid #2e2e3a",
              borderRadius: "5px",
              color: saveName.trim() && isCustomised ? "#c9a96e" : "#3a3a50",
              fontSize: "11px", fontFamily: "'Georgia', serif",
              letterSpacing: "0.08em", padding: "8px 16px",
              cursor: saveName.trim() && isCustomised ? "pointer" : "default",
              textTransform: "uppercase", transition: "all 0.2s", flexShrink: 0,
            }}
          >
            Save Preset
          </button>
        </div>
        {!isCustomised && (
          <div style={{ marginTop: "6px", fontSize: "11px", color: "#3a3a50" }}>
            Write or load a prompt above before saving a preset.
          </div>
        )}
      </div>
    </div>
  );
}

function MaxTokensSlider({ settingKey, local, update }) {
  const value = local[settingKey] ?? 4096;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <input
        type="range"
        min={256}
        max={32000}
        step={256}
        value={value}
        onChange={e => update(settingKey, Number(e.target.value))}
        style={{ flex: 1, accentColor: "#c9a96e", cursor: "pointer" }}
      />
      <input
        type="number"
        min={256}
        max={32000}
        step={256}
        value={value}
        onChange={e => {
          const v = Math.max(256, Math.min(32000, Number(e.target.value) || 256));
          update(settingKey, v);
        }}
        style={{
          width: "80px",
          background: "#0c0c14", border: "1.5px solid #2e2e3a",
          borderRadius: "5px", color: "#c9a96e",
          padding: "6px 10px", fontSize: "13px",
          fontFamily: "ui-monospace, monospace",
          outline: "none", textAlign: "right",
        }}
      />
    </div>
  );
}

function ForgeTab({ local, update }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <p style={{ margin: "0 0 28px", color: "#5a5a72", fontSize: "14px", lineHeight: "1.6" }}>
        Configure how Story Forge behaves when writing and continuing story drafts.
      </p>
      <SectionDivider title="Layout" />
      <div style={{ marginBottom: "28px" }}>
        <Toggle
          checked={local.forgePanelSlide ?? true}
          onChange={val => update("forgePanelSlide", val)}
          label="Auto-hide prompt panel on generate"
          description="Slides the prompt panel away when generation starts, giving the story output the full width. You can still show it again manually via the toggle in the output panel."
        />
      </div>
      <SectionDivider title="Output Behaviour" />
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "13px", color: "#c8c0b0", fontFamily: "'Georgia', serif", marginBottom: "4px" }}>
          Max Reply Tokens
        </div>
        <div style={{ fontSize: "12px", color: "#4a4a62", lineHeight: "1.55", marginBottom: "10px" }}>
          Maximum tokens the AI may generate per Forge request. Higher values allow longer drafts but cost more.
        </div>
        <MaxTokensSlider settingKey="forgeMaxTokens" local={local} update={update} />
      </div>
    </div>
  );
}

function TrackerTab({ local, update }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <p style={{ margin: "0 0 28px", color: "#5a5a72", fontSize: "14px", lineHeight: "1.6" }}>
        Configure how Story Tracker behaves when generating chapter summaries and story memories.
      </p>
      <SectionDivider title="Output Behaviour" />
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "13px", color: "#c8c0b0", fontFamily: "'Georgia', serif", marginBottom: "4px" }}>
          Max Reply Tokens
        </div>
        <div style={{ fontSize: "12px", color: "#4a4a62", lineHeight: "1.55", marginBottom: "10px" }}>
          Maximum tokens the AI may generate per Tracker request. Summaries and memories are typically short, so a lower value here is fine.
        </div>
        <MaxTokensSlider settingKey="trackerMaxTokens" local={local} update={update} />
      </div>
    </div>
  );
}

const SETTING_TABS = [
  { id: "api", label: "API Configuration" },
  { id: "generator", label: "Prompt Generator" },
  { id: "forge", label: "Story Forge" },
  { id: "tracker", label: "Story Tracker" },
];

export default function SettingsScreen({ settings, onSave, onBack, saveApiKey, clearApiKey }) {
  const [local, setLocal]         = useState({ ...settings });
  const [activeTab, setActiveTab] = useState("api");
  const [keyStatus, setKeyStatus] = useState({ claude: "idle", openai: "idle" });
  const [keyError, setKeyError]   = useState({ claude: "", openai: "" });
  const [keyInput, setKeyInput]   = useState({ claude: "", openai: "" });
  const [enteringKey, setEnteringKey] = useState({ claude: false, openai: false });
  const [fetchedModels, setFetchedModels] = useState({
    claude: settings.claudeModels?.length ? settings.claudeModels : null,
    openai: settings.openaiModels?.length ? settings.openaiModels : null,
  });

  useEffect(() => {
    const missing = [];
    if (settings.claudeKeySet && !settings.claudeModels?.length) missing.push("claude");
    if (settings.openaiKeySet && !settings.openaiModels?.length) missing.push("openai");
    missing.forEach(provider => {
      api.getModels(provider)
        .then(({ models }) => {
          if (models?.length) setFetchedModels(prev => ({ ...prev, [provider]: models }));
        })
        .catch(() => {});
    });
  }, []);

  const update = (key, val) => setLocal(prev => ({ ...prev, [key]: val }));

  const handleSaveKey = async (provider) => {
    const key = keyInput[provider];
    if (!key) return;
    setKeyStatus(prev => ({ ...prev, [provider]: "saving" }));
    setKeyError(prev => ({ ...prev, [provider]: "" }));
    try {
      const { models, settings: next } = await saveApiKey(provider, key);
      setKeyStatus(prev => ({ ...prev, [provider]: "ok" }));
      setFetchedModels(prev => ({ ...prev, [provider]: models }));
      setKeyInput(prev => ({ ...prev, [provider]: "" }));
      setEnteringKey(prev => ({ ...prev, [provider]: false }));
      setLocal(prev => {
        const merged = { ...prev, ...next };
        if (models.length) {
          const ids = models.map(m => m.id);
          if (provider === "claude") {
            if (!ids.includes(merged.claudeModel)) merged.claudeModel = models[0].id;
            if (!ids.includes(merged.claudeForgeModel)) merged.claudeForgeModel = models[0].id;
            if (!ids.includes(merged.claudeTrackerModel)) merged.claudeTrackerModel = models[0].id;
          } else {
            if (!ids.includes(merged.openaiModel)) merged.openaiModel = models[0].id;
            if (!ids.includes(merged.openaiForgeModel)) merged.openaiForgeModel = models[0].id;
            if (!ids.includes(merged.openaiTrackerModel)) merged.openaiTrackerModel = models[0].id;
          }
        }
        return merged;
      });
    } catch (e) {
      setKeyStatus(prev => ({ ...prev, [provider]: "error" }));
      setKeyError(prev => ({ ...prev, [provider]: e.message }));
    }
  };

  const handleRemoveKey = async (provider) => {
    await clearApiKey(provider);
    setLocal(prev => ({
      ...prev,
      claudeKeySet: provider === "claude" ? false : prev.claudeKeySet,
      openaiKeySet: provider === "openai" ? false : prev.openaiKeySet,
    }));
    setKeyStatus(prev => ({ ...prev, [provider]: "idle" }));
    setKeyError(prev => ({ ...prev, [provider]: "" }));
    setFetchedModels(prev => ({ ...prev, [provider]: null }));
    setEnteringKey(prev => ({ ...prev, [provider]: false }));
  };

  const handleSave = () => {
    onSave(local);
    onBack();
  };

  const isClaude    = local.provider === "claude";
  const curProvider = isClaude ? "claude" : "openai";
  const curKeySet   = isClaude ? local.claudeKeySet : local.openaiKeySet;
  const curStatus   = isClaude ? keyStatus.claude : keyStatus.openai;
  const curError    = isClaude ? keyError.claude : keyError.openai;
  const curInput    = isClaude ? keyInput.claude : keyInput.openai;
  const isEntering  = isClaude ? enteringKey.claude : enteringKey.openai;
  const showInput   = !curKeySet || isEntering;
  const curModels   = (isClaude ? fetchedModels.claude : fetchedModels.openai) || [];

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "36px 32px 80px" }}>
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", color: "#5a5a72", cursor: "pointer",
          fontFamily: "'Georgia', serif", fontSize: "13px", letterSpacing: "0.06em",
          padding: 0, display: "flex", alignItems: "center", gap: "6px",
          marginBottom: "40px", transition: "color 0.2s",
        }}
      >
        ← Back
      </button>

      <div style={{ maxWidth: "560px" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{
            fontSize: "10px", letterSpacing: "0.22em", color: "#c9a96e",
            textTransform: "uppercase", fontFamily: "'Georgia', serif", marginBottom: "10px",
          }}>
            ✦ Settings
          </div>
          <div style={{ fontSize: "26px", fontWeight: "normal", color: "#e8e0d0", fontFamily: "'Georgia', serif", letterSpacing: "-0.01em" }}>
            Configuration
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #1e1e2a", marginBottom: "28px" }}>
          {SETTING_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 18px", background: "none", border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #c9a96e" : "2px solid transparent",
                color: activeTab === tab.id ? "#c9a96e" : "#5a5a72",
                fontSize: "12px", fontFamily: "'Georgia', serif",
                letterSpacing: "0.06em", cursor: "pointer",
                transition: "all 0.2s", textTransform: "uppercase",
                marginBottom: "-1px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "api" && (
          <>
            <p style={{ margin: "0 0 28px", color: "#5a5a72", fontSize: "14px", lineHeight: "1.6" }}>
              Connect your API keys to enable AI-powered prompt generation.
            </p>

            <div style={{ marginBottom: "32px" }}>
              <SectionDivider title="Active Provider" />
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { id: "claude", label: "Claude (Anthropic)" },
                  { id: "openai", label: "OpenAI" },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => update("provider", p.id)}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: "6px",
                      border: local.provider === p.id ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
                      background: local.provider === p.id ? "rgba(201,169,110,0.1)" : "rgba(255,255,255,0.02)",
                      color: local.provider === p.id ? "#c9a96e" : "#5a5a72",
                      fontSize: "13px", fontFamily: "'Georgia', serif", cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "32px" }}>
              <SectionDivider title={isClaude ? "Claude — Anthropic" : "OpenAI"} />

              <div style={{ marginBottom: "18px" }}>
                <label style={labelStyle}>API Key</label>

                {curKeySet && !isEntering ? (
                  <div>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(74,222,128,0.04)", border: "1.5px solid rgba(74,222,128,0.15)",
                      borderRadius: "6px", padding: "10px 14px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "6px", height: "6px", borderRadius: "50%",
                          background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.55)", flexShrink: 0,
                        }} />
                        <span style={{ fontSize: "13px", color: "#7a9a7a", fontFamily: "'Georgia', serif" }}>
                          Key configured
                        </span>
                      </div>
                      <span style={{ fontSize: "11px", color: "#4ade80", fontFamily: "'Georgia', serif" }}>
                        Active
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button
                        onClick={() => setEnteringKey(prev => ({ ...prev, [curProvider]: true }))}
                        style={ghostMiniBtn}
                      >
                        Update Key
                      </button>
                      <button
                        onClick={() => handleRemoveKey(curProvider)}
                        style={{ ...ghostMiniBtn, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ position: "relative" }}>
                      <input
                        type="password"
                        value={curInput}
                        onChange={e => setKeyInput(prev => ({ ...prev, [curProvider]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && handleSaveKey(curProvider)}
                        placeholder={isClaude ? "sk-ant-api03-..." : "sk-proj-..."}
                        style={{ ...inputStyle }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                      <KeyStatusDot status={curStatus} error={curError} />
                      <div style={{ display: "flex", gap: "8px" }}>
                        {isEntering && (
                          <button
                            onClick={() => {
                              setEnteringKey(prev => ({ ...prev, [curProvider]: false }));
                              setKeyInput(prev => ({ ...prev, [curProvider]: "" }));
                              setKeyStatus(prev => ({ ...prev, [curProvider]: "idle" }));
                            }}
                            style={ghostMiniBtn}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleSaveKey(curProvider)}
                          disabled={curStatus === "saving" || !curInput}
                          style={{
                            background: "none", border: "1px solid #2e2e3a", borderRadius: "5px",
                            color: curStatus === "saving" ? "#5a5a72" : "#7a7a95",
                            fontSize: "11px", fontFamily: "'Georgia', serif",
                            padding: "5px 12px", cursor: "pointer", letterSpacing: "0.06em",
                            opacity: !curInput ? 0.4 : 1, transition: "all 0.15s",
                          }}
                        >
                          {curStatus === "saving" ? "Saving…" : "Save Key"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {(curKeySet || curStatus === "ok") && (
                <>
                  <div style={{ marginBottom: "18px" }}>
                    <label style={labelStyle}>Prompt Generator Model</label>
                    <ModelSelect
                      value={isClaude ? local.claudeModel : local.openaiModel}
                      onChange={val => update(isClaude ? "claudeModel" : "openaiModel", val)}
                      models={curModels}
                    />
                    <div style={{ fontSize: "11px", color: "#3a3a50", marginTop: "6px", lineHeight: "1.55" }}>
                      Used by the Prompt Generator tab to create writing prompts.
                    </div>
                  </div>
                  <div style={{ marginBottom: "18px" }}>
                    <label style={labelStyle}>Story Forge Model</label>
                    <ModelSelect
                      value={isClaude ? (local.claudeForgeModel || local.claudeModel) : (local.openaiForgeModel || local.openaiModel)}
                      onChange={val => update(isClaude ? "claudeForgeModel" : "openaiForgeModel", val)}
                      models={curModels}
                    />
                    <div style={{ fontSize: "11px", color: "#3a3a50", marginTop: "6px", lineHeight: "1.55" }}>
                      Used by Story Forge to write full story drafts. A more capable model yields better prose.
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Story Tracker Model</label>
                    <ModelSelect
                      value={isClaude ? (local.claudeTrackerModel || local.claudeModel) : (local.openaiTrackerModel || local.openaiModel)}
                      onChange={val => update(isClaude ? "claudeTrackerModel" : "openaiTrackerModel", val)}
                      models={curModels}
                    />
                    <div style={{ fontSize: "11px", color: "#3a3a50", marginTop: "6px", lineHeight: "1.55" }}>
                      Used by Story Tracker for chapter summaries and memory generation.
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {activeTab === "generator" && (
          <GeneratorTab local={local} update={update} />
        )}

        {activeTab === "forge" && (
          <ForgeTab local={local} update={update} />
        )}

        {activeTab === "tracker" && (
          <TrackerTab local={local} update={update} />
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onBack} style={{ ...ghostBtn, fontSize: "12px", padding: "11px 22px" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              background: "linear-gradient(135deg, #b8923a 0%, #c9a96e 50%, #d4b87a 100%)",
              color: "#1a1208", border: "none", borderRadius: "6px",
              padding: "11px 28px", fontSize: "12px",
              fontFamily: "'Georgia', serif", fontWeight: "bold",
              cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
