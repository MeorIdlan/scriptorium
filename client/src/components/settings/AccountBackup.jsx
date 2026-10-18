import { useEffect, useRef, useState } from 'react';

// Whole-account backup. The archive downloads through a hidden form that posts
// into a hidden iframe, so the browser streams the file to disk and the tab
// never holds it in memory (that's why this doesn't use api.download).
export default function AccountBackup() {
  const formRef = useRef(null);
  const [started, setStarted] = useState(false);

  // Re-enables the button after a while; the cleanup also covers unmount
  useEffect(() => {
    if (!started) return undefined;
    const timer = setTimeout(() => setStarted(false), 5000);
    return () => clearTimeout(timer);
  }, [started]);

  function handleClick() {
    formRef.current.submit();
    setStarted(true);
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Backup</h2>
      <div className="settings-field">
        <p className="settings-description">
          A full backup of every work: chapters, version history, plot threads, Codex and Map. Each work is one file
          in the archive. Settings and API keys are not included.
        </p>
      </div>
      <div className="settings-actions">
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="account-backup-button"
          onClick={handleClick}
          disabled={started}
        >
          Back up everything (.zip)
        </button>
      </div>
      {started && (
        <p className="settings-description" role="status">
          Your download has started. Check your browser's downloads.
        </p>
      )}
      <form
        ref={formRef}
        method="POST"
        action="/api/backup"
        target="account-backup-frame"
        data-testid="account-backup-form"
        hidden
      />
      <iframe name="account-backup-frame" title="Backup download" hidden />
    </section>
  );
}
