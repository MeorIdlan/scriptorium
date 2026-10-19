import { useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import { saveFile } from '../../utils/saveFile.js';
import { backedUpNow } from '../../utils/backupReminder.js';

function daysText(days) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// Nudges the writer to download a full backup of a work that is due one.
// `card` sits at the bottom of a Shelves card; `banner` is the Main Room strip.
export default function BackupReminder({ work, variant, onChange }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  // A ref, not `pending`: two clicks in one batch both see the render's stale `pending`
  const inFlight = useRef(false);

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

  // Runs one request at a time; every reminder button is disabled meanwhile
  async function run(kind, request) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(kind);
    setError(null);
    try {
      await request();
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  function backUp() {
    return run('backup', async () => {
      const { blob, filename } = await api.download(`/works/${work.id}/backup`, {}, 'backup.zip');
      saveFile(blob, filename);
      onChange(backedUpNow());
    });
  }

  function respond(action) {
    return run(action, async () => {
      const res = await api.post(`/works/${work.id}/backup-reminder`, { action });
      onChange(res.backupReminder);
    });
  }

  return (
    <div
      className={`backup-reminder backup-reminder--${variant}`}
      data-testid="backup-reminder"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="backup-reminder-text">{text}</p>
      <div className="backup-reminder-actions">
        <button className="btn btn-secondary" onClick={backUp} disabled={pending !== null}>
          {pending === 'backup' ? 'Backing up…' : 'Back up now'}
        </button>
        <button className="btn btn-ghost" onClick={() => respond('snooze')} disabled={pending !== null}>
          {banner ? 'Remind me later' : 'Later'}
        </button>
        <button
          className="backup-reminder-dismiss"
          aria-label="Dismiss"
          onClick={() => respond('dismiss')}
          disabled={pending !== null}
        >
          {banner ? 'Dismiss' : '✕'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
