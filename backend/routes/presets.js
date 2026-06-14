const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const FILE = path.join(__dirname, "..", "..", "data", "presets.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) || [];
  } catch {
    return [];
  }
}

function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// GET /api/presets
router.get("/", (_req, res) => {
  res.json(read());
});

// POST /api/presets
router.post("/", (req, res) => {
  const presets = read();
  const preset = { id: Date.now().toString(), ...req.body };
  presets.push(preset);
  write(presets);
  res.status(201).json(preset);
});

// DELETE /api/presets/:id
router.delete("/:id", (req, res) => {
  const presets = read();
  const next = presets.filter(p => p.id !== req.params.id);
  if (next.length === presets.length) return res.status(404).json({ error: "Preset not found" });
  write(next);
  res.json({ ok: true });
});

module.exports = router;
