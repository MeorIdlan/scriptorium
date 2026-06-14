import { useState, useEffect } from "react";
import * as api from "../services/api";

const DEFAULTS = {
  provider: "claude",
  claudeKeySet: false,
  claudeModel: "claude-opus-4-8",
  claudeForgeModel: "claude-opus-4-8",
  openaiKeySet: false,
  openaiModel: "gpt-4o",
  openaiForgeModel: "gpt-4o",
  generatorStreaming: true,
  generatorSystemPrompt: "",
  generatorMaxTokens: 4096,
  forgeMaxTokens: 4096,
  trackerMaxTokens: 4096,
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    api.getSettings()
      .then(data => { setSettings({ ...DEFAULTS, ...data }); setSettingsLoaded(true); })
      .catch(() => setSettingsLoaded(true));
  }, []);

  const updateSettings = async (updates) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    await api.updateSettings(updates);
  };

  const saveApiKey = async (provider, key) => {
    const result = await api.setApiKey(provider, key);
    setSettings(prev => ({ ...prev, ...result.settings }));
    return result;
  };

  const clearApiKey = async (provider) => {
    const next = await api.removeApiKey(provider);
    setSettings(prev => ({ ...prev, ...next }));
  };

  return { settings, settingsLoaded, updateSettings, saveApiKey, clearApiKey };
}
