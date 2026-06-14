import { useState, useRef, useEffect } from "react";
import { useSettings } from "./hooks/useSettings";
import { useStories } from "./hooks/useStories";
import PromptGenerator from "./features/generator/PromptGenerator";
import StoryTracker from "./features/tracker/StoryTracker";
import StoryForge from "./features/forge/StoryForge";
import SettingsScreen from "./features/settings/SettingsScreen";

const TABS = [
  { id: "generator", label: "Prompt Generator" },
  { id: "forge",     label: "Story Forge" },
  { id: "tracker",   label: "Story Tracker" },
];

const TAB_IDS = TABS.map(t => t.id);

export default function App() {
  const [activeTab, setActiveTab]       = useState("generator");
  const [activeScreen, setActiveScreen] = useState(null);
  const [forgePrompt, setForgePrompt]   = useState("");
  const [indicator, setIndicator]       = useState({ left: 0, width: 0, ready: false });
  const tabRefs = useRef({});
  const navRef  = useRef(null);

  const { settings, settingsLoaded, updateSettings, saveApiKey, clearApiKey } = useSettings();
  const storiesData = useStories();

  useEffect(() => {
    const btn = tabRefs.current[activeTab];
    const nav = navRef.current;
    if (!btn || !nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({ left: btnRect.left - navRect.left, width: btnRect.width, ready: true });
  }, [activeTab, activeScreen]);

  const onSettingsToggle = () =>
    setActiveScreen(prev => prev === "settings" ? null : "settings");

  const handleSendToForge = (prompt) => {
    setForgePrompt(prompt);
    setActiveTab("forge");
  };

  if (!settingsLoaded) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0e0e16", color: "#d0c8b8",
        fontFamily: "'Georgia', serif", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ color: "#5a5a72", fontSize: "13px", letterSpacing: "0.08em" }}>
          Connecting to backend…
        </div>
      </div>
    );
  }

  const activeTabIndex = TAB_IDS.indexOf(activeTab);

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e16", color: "#d0c8b8", fontFamily: "'Georgia', serif" }}>

      <div style={{ borderBottom: "1px solid #1e1e2a", padding: "24px 32px", background: "linear-gradient(180deg, #12121c 0%, #0e0e16 100%)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.25em", color: "#c9a96e", textTransform: "uppercase", marginBottom: "6px" }}>
              ✦ Narrative Engine
            </div>
            <h1 style={{ margin: 0, fontSize: "32px", fontWeight: "normal", color: "#e8e0d0", letterSpacing: "-0.01em" }}>
              Scriptorium
            </h1>
            <p style={{ margin: "8px 0 0", color: "#5a5a72", fontSize: "14px" }}>
              Shape your story parameters — forge a prompt ready for any AI writer.
            </p>
          </div>
          <button
            onClick={onSettingsToggle}
            title="API Settings"
            style={{
              background: activeScreen === "settings" ? "rgba(201,169,110,0.1)" : "rgba(255,255,255,0.03)",
              border: activeScreen === "settings" ? "1.5px solid #c9a96e" : "1.5px solid #2e2e3a",
              borderRadius: "8px",
              color: activeScreen === "settings" ? "#c9a96e" : (settings.claudeKeySet || settings.openaiKeySet) ? "#c9a96e" : "#5a5a72",
              cursor: "pointer", padding: "10px 14px", fontSize: "16px",
              lineHeight: 1, flexShrink: 0, transition: "all 0.2s", marginTop: "4px",
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      <div style={{ display: activeScreen === "settings" ? "none" : "block", borderBottom: "1px solid #1e1e2a", background: "#0e0e16" }}>
          <div ref={navRef} style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 32px", display: "flex", position: "relative" }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                ref={el => { tabRefs.current[tab.id] = el; }}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "14px 20px", background: "none", border: "none",
                  borderBottom: "2px solid transparent",
                  color: activeTab === tab.id ? "#c9a96e" : "#5a5a72",
                  fontSize: "13px", fontFamily: "'Georgia', serif",
                  letterSpacing: "0.06em", cursor: "pointer",
                  transition: "color 0.25s", textTransform: "uppercase",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
              </button>
            ))}
            <div style={{
              position: "absolute",
              bottom: 0,
              left: indicator.left,
              width: indicator.width,
              height: "2px",
              background: "#c9a96e",
              opacity: indicator.ready ? 1 : 0,
              transition: indicator.ready
                ? "left 0.3s cubic-bezier(0.4,0,0.2,1), width 0.3s cubic-bezier(0.4,0,0.2,1)"
                : "none",
              pointerEvents: "none",
            }} />
          </div>
        </div>

      <div style={{ display: activeScreen === "settings" ? "block" : "none" }}>
        <SettingsScreen
          settings={settings}
          onSave={updateSettings}
          onBack={() => setActiveScreen(null)}
          saveApiKey={saveApiKey}
          clearApiKey={clearApiKey}
        />
      </div>

      <div style={{ display: activeScreen === "settings" ? "none" : "block", overflowX: "hidden" }}>
        <div style={{
          display: "flex",
          transform: `translateX(-${activeTabIndex * 100}%)`,
          transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
          willChange: "transform",
          alignItems: "flex-start",
        }}>
          <div style={{ minWidth: "100vw" }}>
            <PromptGenerator settings={settings} onSendToForge={handleSendToForge} />
          </div>
          <div style={{ minWidth: "100vw" }}>
            <StoryForge
              settings={settings}
              initialPrompt={forgePrompt}
              onPromptConsumed={() => setForgePrompt("")}
              stories={storiesData.stories}
              addStory={storiesData.addStory}
              addChapter={storiesData.addChapter}
              onGoToTracker={() => setActiveTab("tracker")}
            />
          </div>
          <div style={{ minWidth: "100vw" }}>
            <StoryTracker settings={settings} {...storiesData} />
          </div>
        </div>
      </div>

    </div>
  );
}
