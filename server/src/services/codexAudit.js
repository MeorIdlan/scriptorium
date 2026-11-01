import { normalizeAliases } from './contextBlock.js';

// The Codex fields the audit prompt sees. Aliases are normalized to a list so
// the model never sees the storage shape (comma text or array).
export function codexAuditSummary(codex) {
  return {
    characters: (codex?.characters || []).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      aliases: normalizeAliases(c.aliases),
      affiliations: c.affiliations,
      notes: c.notes,
      physical: c.physical,
    })),
    places: (codex?.places || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      notes: p.notes,
    })),
    worldRules: (codex?.worldRules || []).map((r) => ({
      id: r.id,
      category: r.category,
      rule: r.rule,
      description: r.description,
    })),
  };
}
