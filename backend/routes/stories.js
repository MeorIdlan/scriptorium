const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const FILE = path.join(__dirname, "..", "..", "data", "stories.json");

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

// GET /api/stories
router.get("/", (_req, res) => {
  res.json(read());
});

// POST /api/stories
router.post("/", (req, res) => {
  const stories = read();
  const story = {
    id: Date.now().toString(),
    content: "",
    chapters: [],
    memories: [],
    createdAt: new Date().toISOString(),
    ...req.body,
  };
  stories.push(story);
  write(stories);
  res.status(201).json(story);
});

// PATCH /api/stories/:id
router.patch("/:id", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  stories[idx] = { ...stories[idx], ...req.body };
  write(stories);
  res.json(stories[idx]);
});

// DELETE /api/stories/:id
router.delete("/:id", (req, res) => {
  const stories = read();
  const next = stories.filter(s => s.id !== req.params.id);
  if (next.length === stories.length) return res.status(404).json({ error: "Story not found" });
  write(next);
  res.json({ ok: true });
});

// PATCH /api/stories/:id/content
router.patch("/:id/content", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  stories[idx] = { ...stories[idx], content: req.body.content ?? "" };
  write(stories);
  res.json({ ok: true });
});

// POST /api/stories/:id/chapters
router.post("/:id/chapters", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  const chapter = { id: Date.now().toString(), content: "", summary: "", ...req.body };
  stories[idx].chapters = [...(stories[idx].chapters || []), chapter];
  write(stories);
  res.status(201).json(chapter);
});

// PATCH /api/stories/:id/chapters/:cid
router.patch("/:id/chapters/:cid", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  const cIdx = (stories[idx].chapters || []).findIndex(c => c.id === req.params.cid);
  if (cIdx === -1) return res.status(404).json({ error: "Chapter not found" });
  stories[idx].chapters[cIdx] = { ...stories[idx].chapters[cIdx], ...req.body };
  write(stories);
  res.json(stories[idx].chapters[cIdx]);
});

// DELETE /api/stories/:id/chapters/:cid
router.delete("/:id/chapters/:cid", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  stories[idx].chapters = (stories[idx].chapters || []).filter(c => c.id !== req.params.cid);
  write(stories);
  res.json({ ok: true });
});

// PATCH /api/stories/:id/chapters/:cid/content
router.patch("/:id/chapters/:cid/content", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  const cIdx = (stories[idx].chapters || []).findIndex(c => c.id === req.params.cid);
  if (cIdx === -1) return res.status(404).json({ error: "Chapter not found" });
  stories[idx].chapters[cIdx] = { ...stories[idx].chapters[cIdx], content: req.body.content ?? "" };
  write(stories);
  res.json({ ok: true });
});

// POST /api/stories/:id/memories
router.post("/:id/memories", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  const memory = { id: Date.now().toString(), ...req.body };
  stories[idx].memories = [...(stories[idx].memories || []), memory];
  write(stories);
  res.status(201).json(memory);
});

// PATCH /api/stories/:id/memories/:mid
router.patch("/:id/memories/:mid", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  const mIdx = (stories[idx].memories || []).findIndex(m => m.id === req.params.mid);
  if (mIdx === -1) return res.status(404).json({ error: "Memory not found" });
  stories[idx].memories[mIdx] = { ...stories[idx].memories[mIdx], ...req.body };
  write(stories);
  res.json(stories[idx].memories[mIdx]);
});

// DELETE /api/stories/:id/memories/:mid
router.delete("/:id/memories/:mid", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  stories[idx].memories = (stories[idx].memories || []).filter(m => m.id !== req.params.mid);
  write(stories);
  res.json({ ok: true });
});

// PUT /api/stories/:id/memories  — replace all memories
router.put("/:id/memories", (req, res) => {
  const stories = read();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Story not found" });
  stories[idx].memories = req.body;
  write(stories);
  res.json({ ok: true });
});

module.exports = router;
