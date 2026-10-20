// Focus for a row that is about to leave its list (Delete, Discard, Remove). The
// row's buttons go with it, so focus would fall to the page. Takes the rows in
// order, the leaving row's index and the section's add button. Returns a ref for
// useReturnFocus: the next row's first button, else the previous row's, else the
// fallback. Call it before the row is removed, while the rows are still there.
// pick finds a row's action; the default is its first button.
export function rowLeaveFocus(rows, index, fallback = null, pick = (row) => row.querySelector('button')) {
  const first = (row) => (row ? pick(row) : null);
  const target = first(rows[index + 1]) || first(rows[index - 1]) || fallback;
  return target ? { current: target } : null;
}
