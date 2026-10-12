// What the "AI features" switch in Settings shows; aiEnabled and aiAvailable
// come from GET /api/settings (the server decides both)
export function aiSwitchState(settings, { saving = false } = {}) {
  const available = Boolean(settings?.aiAvailable);
  return {
    checked: available && Boolean(settings?.aiEnabled),
    disabled: !available || saving,
    hint: available || !settings ? null : 'Save an API key to turn on AI features.',
  };
}
