export function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

export function exportStoriesJSON(stories) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(stories, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `stories-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(text) {
  return (text || "story")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "story";
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Assemble a single story into one document body. `markdown` toggles heading syntax.
function buildStoryDocument(story, { markdown }) {
  const h1 = (t) => markdown ? `# ${t}` : t;
  const h2 = (t) => markdown ? `## ${t}` : t;
  const rule = markdown ? "\n---\n" : "\n" + "—".repeat(40) + "\n";

  const parts = [h1(story.title || "Untitled")];
  if (story.synopsis && story.synopsis.trim()) {
    parts.push(markdown ? `_${story.synopsis.trim()}_` : story.synopsis.trim());
  }

  if (story.type === "serialized") {
    (story.chapters || []).forEach((c, i) => {
      parts.push(rule);
      parts.push(h2(c.title || `Chapter ${i + 1}`));
      parts.push((c.content || "").trim() || "(no content)");
    });
  } else {
    parts.push("");
    parts.push((story.content || "").trim() || "(no content)");
  }

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function exportStoryMarkdown(story) {
  download(`${slugify(story.title)}.md`, buildStoryDocument(story, { markdown: true }), "text/markdown");
}

export function exportStoryText(story) {
  download(`${slugify(story.title)}.txt`, buildStoryDocument(story, { markdown: false }), "text/plain");
}
