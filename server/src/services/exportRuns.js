import { TextRun } from 'docx';

// A paragraph is Run[]: { text, bold, italic, underline } pieces of one paragraph's text

export function paragraphText(runs) {
  return runs.map((run) => run.text).join('');
}

// The paragraph's lines, each a Run[]; a line break ends one line and starts the next.
// An empty line is []
export function runLines(runs) {
  const lines = [[]];
  for (const run of runs) {
    run.text.split('\n').forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ ...run, text: piece });
    });
  }
  return lines;
}

export function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The paragraph as EPUB markup: each run wrapped in its style, line breaks as <br/>
export function runsHTML(runs) {
  return runs
    .map((run) => {
      let html = escapeXml(run.text).replace(/\n/g, '<br/>');
      if (run.underline) html = `<span style="text-decoration: underline">${html}</span>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

// The paragraph as DOCX runs; a line break is a break in its own run, with the same style
export function docxTextRuns(runs) {
  const out = [];
  for (const run of runs) {
    // Only the flags that are set go into the XML, so a plain run takes its bold and italic from the style
    const style = {
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italics: true } : {}),
      ...(run.underline ? { underline: {} } : {}),
    };
    run.text.split('\n').forEach((piece, i) => {
      if (i > 0 || piece) out.push(new TextRun({ text: piece, break: i > 0 ? 1 : 0, ...style }));
    });
  }
  return out;
}

// The PDF font name for a run's bold and italic flags
export function pdfFont(fonts, run) {
  if (run.bold) return run.italic ? fonts.boldItalic : fonts.bold;
  return run.italic ? fonts.italic : fonts.regular;
}
