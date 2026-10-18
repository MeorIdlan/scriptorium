// Test helper: reads back the text layout of a PDF written by pdfkit with standard
// fonts. It understands only what pdfkit writes: `N 0 obj` objects, one content
// stream per page (Flate or unfiltered), Tm positions, Tf fonts, and hex strings in
// Tj/TJ. Each run is one BT...ET block. Coordinates are points; y is the baseline,
// measured from the top of the page; text is decoded as latin1 (exact for ASCII).
import zlib from 'node:zlib';

export function parsePdf(buffer) {
  const s = buffer.toString('latin1');
  const objects = readObjects(s);
  const pages = [];
  const visit = (n) => {
    const dict = objects.get(n).dict;
    if (/\/Type \/Pages/.test(dict)) {
      for (const [, kid] of dict.match(/\/Kids \[([^\]]*)\]/)[1].matchAll(/(\d+) 0 R/g)) visit(+kid);
    } else {
      pages.push(readPage(objects, n));
    }
  };
  const root = objects.get(+/\/Root (\d+) 0 R/.exec(s)[1]).dict;
  visit(+/\/Pages (\d+) 0 R/.exec(root)[1]);
  return { pages };
}

// Every `N 0 obj` in the file: its dictionary text and, for streams, decoded data.
function readObjects(s) {
  const objects = new Map();
  for (const m of s.matchAll(/(\d+) 0 obj\b/g)) {
    const from = m.index + m[0].length;
    const body = s.slice(from, s.indexOf('endobj', from));
    const stream = /stream\r?\n/.exec(body);
    if (!stream) {
      objects.set(+m[1], { dict: body });
      continue;
    }
    const dict = body.slice(0, stream.index);
    const start = stream.index + stream[0].length;
    const length = +/\/Length (\d+)/.exec(dict)[1];
    let data = Buffer.from(body.slice(start, start + length), 'latin1');
    if (dict.includes('/FlateDecode')) data = zlib.inflateSync(data);
    objects.set(+m[1], { dict, data: data.toString('latin1') });
  }
  return objects;
}

function readPage(objects, n) {
  const dict = objects.get(n).dict;
  const [, width, height] = dict.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  const resources = objects.get(+/\/Resources (\d+) 0 R/.exec(dict)[1]).dict;
  const fonts = {};
  for (const [, name, id] of resources.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    fonts[name] = /\/BaseFont \/(\S+)/.exec(objects.get(+id).dict)[1];
  }
  const content = objects.get(+/\/Contents (\d+) 0 R/.exec(dict)[1]).data;
  return { width: +width, height: +height, runs: readRuns(content, fonts, +height) };
}

// BT/ET bracket a run; Tm sets its position (pdfkit's flipped Tm y is from the bottom),
// Tf its font and size, and each hex string inside it is text.
const OPS = /\bBT\b|\bET\b|(?:-?[\d.]+ ){4}(-?[\d.]+) (-?[\d.]+) Tm|\/(\S+) ([\d.]+) Tf|<([0-9a-fA-F]*)>/g;

function readRuns(content, fonts, pageHeight) {
  const runs = [];
  let run = null;
  for (const m of content.matchAll(OPS)) {
    if (m[0] === 'BT') {
      run = { x: 0, y: 0, font: null, size: 0, text: '' };
    } else if (m[0] === 'ET') {
      if (run.text) runs.push({ text: run.text, x: run.x, y: run.y, font: run.font, size: run.size });
      run = null;
    } else if (m[1] !== undefined) {
      run.x = +m[1];
      run.y = pageHeight - +m[2];
    } else if (m[3] !== undefined) {
      run.font = fonts[m[3]];
      run.size = +m[4];
    } else if (m[5] !== undefined) {
      run.text += Buffer.from(m[5], 'hex').toString('latin1');
    }
  }
  return runs;
}
