// A paragraph is Run[]: { text, bold, italic, underline } pieces of one paragraph's text

export function paragraphText(runs) {
  return runs.map((run) => run.text).join('');
}
