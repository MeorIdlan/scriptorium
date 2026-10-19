// Re-runs an async read until it returns a truthy value (40 tries, 10 ms apart). Uses setTimeout,
// so it still works when a test pins Date with mock.timers. Gives up quietly: the caller's assertion
// then shows the real state.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollUntil(read) {
  for (let i = 0; i < 40; i++) {
    const value = await read();
    if (value) return value;
    await sleep(10);
  }
}
