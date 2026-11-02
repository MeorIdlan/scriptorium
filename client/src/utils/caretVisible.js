// How far to scroll the editor so the caret line sits inside the visible band, with `margin`
// to spare at each end: positive scrolls down, negative up, 0 when it is already inside.
// All values are client coordinates (px). The bottom edge wins when the band is too short
// for both margins, since that is the edge the keyboard covers.
export function caretScrollDelta({ caretTop, caretBottom, viewTop, viewBottom, margin }) {
  const bottomLimit = viewBottom - margin;
  const topLimit = viewTop + margin;
  if (caretBottom > bottomLimit) return caretBottom - bottomLimit;
  if (caretTop < topLimit) return caretTop - topLimit;
  return 0;
}
