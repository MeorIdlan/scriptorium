import { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { parseGoalInput } from '../../utils/dailyProgress.js';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

// The writer's daily word goal (FR-18). Shown whether or not AI is on.
export default function DailyGoalField() {
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const busy = saving || !loaded;

  useEffect(() => {
    api
      .get('/progress/today')
      .then((data) => {
        setInput(data.goal === null ? '' : String(data.goal));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(text) {
    const parsed = parseGoalInput(text);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put('/progress/goal', { goal: parsed.goal });
      setInput(res.goal === null ? '' : String(res.goal));
      setMessage(res.goal === null ? 'Goal cleared' : 'Goal saved');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Daily Word Goal</h2>
      <div className="settings-field">
        <label className="settings-label" htmlFor="daily-goal">Words per day</label>
        <p className="settings-description">
          Today's progress shows next to the word count while you write. Leave it empty for no goal.
        </p>
        <input
          id="daily-goal"
          className="form-input"
          type="number"
          inputMode="numeric"
          min="1"
          max="100000"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!loaded}
        />
      </div>
      <div className="settings-actions">
        <button className="btn btn-primary" onClick={guardBusy(busy, () => save(input))} {...busyProps(busy)}>
          Save goal
        </button>
        <button className="btn btn-secondary" onClick={guardBusy(busy, () => save(''))} {...busyProps(busy)}>
          Clear goal
        </button>
      </div>
      {message && <p className="settings-description" role="status">{message}</p>}
    </section>
  );
}
