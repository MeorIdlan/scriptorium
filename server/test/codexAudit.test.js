import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexAuditSummary } from '../src/services/codexAudit.js';

// The Codex UI saves aliases as comma text; older entries hold an array. The
// audit prompt must see one shape, or the model tells the writer to "convert
// aliases to an array" (found on the real-key run, card eCuQTpRp).
test('aliases reach the audit as a list whether stored as text or array', () => {
  const summary = codexAuditSummary({
    characters: [
      { id: 'c1', name: 'Mara', aliases: 'lord mara; Lady Mara,  ' },
      { id: 'c2', name: 'Joren', aliases: ['the watcher'] },
      { id: 'c3', name: 'Wren' },
    ],
  });
  assert.deepEqual(
    summary.characters.map((c) => c.aliases),
    [['lord mara', 'Lady Mara'], ['the watcher'], []],
  );
});

test('places and world rules keep their fields; a missing codex is empty', () => {
  const summary = codexAuditSummary({
    places: [{ id: 'p1', name: 'Tower', description: 'Flooded.', notes: 'n', flags: [] }],
    worldRules: [{ id: 'r1', category: 'geography', rule: 'Third stair.', description: 'd', flags: [] }],
  });
  assert.deepEqual(summary.places, [{ id: 'p1', name: 'Tower', description: 'Flooded.', notes: 'n' }]);
  assert.deepEqual(summary.worldRules, [{ id: 'r1', category: 'geography', rule: 'Third stair.', description: 'd' }]);
  assert.deepEqual(codexAuditSummary(null), { characters: [], places: [], worldRules: [] });
});
