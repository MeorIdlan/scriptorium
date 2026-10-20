// What the "AI features" switch in Settings shows; aiEnabled and aiAvailable
// come from GET /api/settings (the server decides both). While a change saves
// the switch stays focusable (busy, not disabled), so a disabled checkbox
// doesn't drop focus; its handler ignores another flip.
export function aiSwitchState(settings, { saving = false } = {}) {
  const available = Boolean(settings?.aiAvailable);
  return {
    checked: available && Boolean(settings?.aiEnabled),
    busy: saving,
    disabled: !available,
    hint: available || !settings ? null : 'Save an API key to turn on AI features.',
  };
}
