// The reminder state once a full backup has been made. The server records the
// backup a moment after the response ends, so this is built here, not re-read.
export function backedUpNow() {
  return { due: false, lastBackupAt: new Date().toISOString(), daysSinceBackup: 0 };
}
