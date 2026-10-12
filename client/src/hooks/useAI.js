import { useState, useCallback } from 'react';
import { api } from '../utils/api.js';
import { useActiveWork } from '../context/ActiveWorkContext.jsx';
import { useAiState } from '../context/AiContext.jsx';

export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const { refreshChapters } = useActiveWork();
  const { aiOn } = useAiState();

  const call = useCallback(async (endpoint, body = {}) => {
    // Controls are hidden when AI is off; this also stops a late or stray call
    if (!aiOn) return null;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post(`/ai/${endpoint}`, body);
      setResult(data);
      // The call may have made chapter summaries; refresh their status
      if (data?.context && typeof body.workId === 'string') refreshChapters(body.workId);
      return data;
    } catch (err) {
      const message =
        err.code === 'NO_API_KEY'
          ? 'No API key configured. Please go to Settings to add your API key.'
          : err.message;
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [aiOn, refreshChapters]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { loading, error, result, call, reset };
}
