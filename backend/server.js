const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const settingsRoutes = require("./routes/settings");
const storiesRoutes = require("./routes/stories");
const presetsRoutes = require("./routes/presets");
const generateRoutes = require("./routes/generate");
const logger = require("./logger");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILES = {
  settings: path.join(DATA_DIR, "settings.json"),
  stories:  path.join(DATA_DIR, "stories.json"),
  presets:  path.join(DATA_DIR, "presets.json"),
};

const SETTINGS_DEFAULTS = {
  provider: "claude",
  claudeApiKey: "",
  claudeModel: "claude-opus-4-8",
  claudeForgeModel: "claude-opus-4-8",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiForgeModel: "gpt-4o",
  generatorStreaming: true,
  generatorSystemPrompt: "",
};

function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILES.settings))
    fs.writeFileSync(DATA_FILES.settings, JSON.stringify(SETTINGS_DEFAULTS, null, 2));
  if (!fs.existsSync(DATA_FILES.stories))
    fs.writeFileSync(DATA_FILES.stories, "[]");
  if (!fs.existsSync(DATA_FILES.presets))
    fs.writeFileSync(DATA_FILES.presets, "[]");
}

initData();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use((req, _res, next) => {
  let bodyInfo = "";
  if (["POST", "PATCH", "PUT"].includes(req.method) && req.body && Object.keys(req.body).length) {
    const sanitized = { ...req.body };
    if ("key" in sanitized) sanitized.key = "[REDACTED]";
    bodyInfo = `\n${JSON.stringify(sanitized, null, 2)}`;
  }
  logger.info("REQUEST", `${req.method} ${req.path}${bodyInfo}`);
  next();
});

app.use("/api/settings", settingsRoutes);
app.use("/api/stories", storiesRoutes);
app.use("/api/presets", presetsRoutes);
app.use("/api/generate", generateRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
