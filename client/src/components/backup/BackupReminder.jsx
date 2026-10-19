import { useState } from 'react';
import { api } from '../../utils/api.js';
import { saveFile } from '../../utils/saveFile.js';
import { backedUpNow } from '../../utils/backupReminder.js';

function daysText(days) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// Nudges the writer to download a full backup of a work that is due one.
// `card` sits at the bottom of a Shelves card; `banner` is the Main Room strip.
export default function BackupReminder({ work, variant, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reminder = work.backupReminder;
  if (!reminder?.due) return null;

  const banner = variant === 'banner';
  const never = !reminder.lastBackupAt;
  const days = reminder.daysSinceBackup;
  let text;
  if (banner) {
    text = never
      ? `${work.title} has never been backed up`
      : `${work.title} hasn't been backed up in ${daysText(days)}`;
  } else {
    text = never ? 'Never backed up' : `Not backed up in ${daysText(days)}`;
  }

  async function backUp() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await api.download(`/works/${work.id}/backup`, {}, 'backup.zip');
      saveFile(blob, filename);
      onChange(backedUpNow());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(action) {
    setError(null);
    try {
      const res = await api.post(`/works/${work.id}/backup-reminder`, { action });
      onChange(res.backupReminder);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div
      className={`backup-reminder backup-reminder--${variant}`}
      data-testid="backup-reminder"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="backup-reminder-text">{text}</p>
      <div className="backup-reminder-actions">
        <button className="btn btn-secondary" onClick={backUp} disabled={busy}>
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        <button className="btn btn-ghost" onClick={() => respond('snooze')}>
          {banner ? 'Remind me later' : 'Later'}
        </button>
        <button className="backup-reminder-dismiss" aria-label="Dismiss" onClick={() => respond('dismiss')}>
          {banner ? 'Dismiss' : '✕'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
