import { useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api.js';
import ProviderSelect from '../components/settings/ProviderSelect.jsx';
import ApiKeyField from '../components/settings/ApiKeyField.jsx';
import ModelSelect from '../components/settings/ModelSelect.jsx';
import ParamSliders from '../components/settings/ParamSliders.jsx';

// Pretty display names for known model ids; anything not listed falls back to the id itself
const MODEL_NAMES = {
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'o1': 'o1',
  'o1-mini': 'o1 mini',
  'o3': 'o3',
  'o3-mini': 'o3 mini',
  'o4-mini': 'o4 mini',
};

function labelModel(m) {
  return { id: m.id, name: MODEL_NAMES[m.id] || m.name || m.id };
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [testing, setTesting] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [pendingApiKey, setPendingApiKey] = useState('');
  const [fetchedModels, setFetchedModels] = useState(null);
  const [keyTestStatus, setKeyTestStatus] = useState(null);

  async function fetchModels(provider, pendingKey) {
    setTesting(true);
    setKeyTestStatus(null);
    try {
      const result = await api.post('/settings/models', {
        provider,
        apiKey: pendingKey || undefined,
      });
      if (result.ok) {
        const models = result.models.map(labelModel);
        setFetchedModels(models);
        setKeyTestStatus({ ok: true, modelCount: models.length });
        return models;
      } else {
        setKeyTestStatus({ ok: false, error: result.error });
        return null;
      }
    } catch (err) {
      setKeyTestStatus({ ok: false, error: err.message });
      return null;
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/settings'),
      api.get('/settings/providers'),
    ])
      .then(([s, p]) => {
        setSettings(s);
        setProviders(Array.isArray(p) ? p : []);
        // Auto-fetch models if a key is already saved
        const provider = s?.activeProvider;
        if (provider && s?.providers?.[provider]?.hasKey) {
          fetchModels(provider, '').then((models) => {
            if (models) {
              const currentModel = s?.providers?.[provider]?.model;
              const ids = models.map((m) => m.id);
              if (!ids.includes(currentModel) && ids.length > 0) {
                setSettings((prev) => ({
                  ...prev,
                  providers: {
                    ...prev.providers,
                    [provider]: { ...prev.providers?.[provider], model: ids[0] },
                  },
                }));
              }
            }
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function setActiveProvider(providerId) {
    setSettings((s) => ({ ...s, activeProvider: providerId }));
    setFetchedModels(null);
    setKeyTestStatus(null);
    setPendingApiKey('');
    if (settings?.providers?.[providerId]?.hasKey) {
      fetchModels(providerId, '');
    }
  }

  function setActiveModel(modelId) {
    const providerId = settings?.activeProvider;
    if (!providerId) return;
    setSettings((s) => ({
      ...s,
      providers: {
        ...s.providers,
        [providerId]: { ...s.providers?.[providerId], model: modelId },
      },
    }));
  }

  function setGenerationParam(field, value) {
    setSettings((s) => ({
      ...s,
      generation: { ...s.generation, [field]: value },
    }));
  }

  async function handleSave() {
    setError(null);
    try {
      const providerId = settings?.activeProvider;
      const payload = {
        activeProvider: settings.activeProvider,
        generation: settings.generation,
        providers: { ...settings.providers },
      };
      if (pendingApiKey && providerId) {
        payload.providers = {
          ...payload.providers,
          [providerId]: {
            ...payload.providers?.[providerId],
            apiKey: pendingApiKey,
          },
        };
      }
      const updated = await api.put('/settings', payload);
      setSettings(updated);
      setPendingApiKey('');
      showToast('Settings saved');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post('/settings/test', { provider: settings?.activeProvider });
      setTestResult({ success: result.ok, message: result.ok ? 'Connection successful' : result.error });
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleTestKey(pendingKey) {
    const provider = settings?.activeProvider;
    if (!provider) return;
    const models = await fetchModels(provider, pendingKey);
    if (models) {
      const currentModel = settings?.providers?.[provider]?.model;
      const ids = models.map((m) => m.id);
      if (!ids.includes(currentModel) && ids.length > 0) {
        setActiveModel(ids[0]);
      }
    }
  }

  async function handleSaveKey(key) {
    const providerId = settings?.activeProvider;
    if (!providerId || !key.trim()) return;
    setSavingKey(true);
    setError(null);
    try {
      const updated = await api.put('/settings', {
        activeProvider: settings.activeProvider,
        providers: {
          [providerId]: { apiKey: key.trim() },
        },
      });
      setSettings(updated);
      setPendingApiKey('');
      showToast('API key saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKey(false);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const activeProviderSettings = settings?.providers?.[settings?.activeProvider];
  const activeModel = activeProviderSettings?.model || '';

  if (loading) {
    return <div className="loading-page"><p className="loading-text">Loading settings…</p></div>;
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
      </div>

      {error && <p className="error-text settings-error">{error}</p>}

      <div className="settings-form">
        <section className="settings-section">
          <h2 className="settings-section-title">AI Provider</h2>

          <ProviderSelect
            providers={providers}
            value={settings?.activeProvider}
            onChange={setActiveProvider}
          />

          <ApiKeyField
            hasKey={activeProviderSettings?.hasKey}
            keyPreview={activeProviderSettings?.keyPreview}
            onChange={(v) => {
              setPendingApiKey(v);
              setKeyTestStatus(null);
            }}
            onTest={handleTestKey}
            onSave={handleSaveKey}
            testing={testing}
            saving={savingKey}
            testStatus={keyTestStatus}
          />

          <ModelSelect
            models={fetchedModels}
            value={activeModel}
            onChange={setActiveModel}
          />
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Generation Parameters</h2>
          <ParamSliders
            maxTokens={settings?.generation?.maxTokens}
            temperature={settings?.generation?.temperature}
            onChange={setGenerationParam}
          />
        </section>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.message}
          </div>
        )}
      </div>

      {toast && (
        <div className="settings-toast">
          {toast}
        </div>
      )}
    </div>
  );
}
