// Focus for a row that is about to leave its list (Delete, Discard, Remove). The
// row's buttons go with it, so focus would fall to the page. Takes the rows in
// order, the leaving row's index and the section's add button. Returns a ref for
// useReturnFocus: the next row's first button, else the previous row's, else the
// fallback. Call it before the row is removed, while the rows are still there.
export function rowLeaveFocus(rows, index, fallback = null) {
  const first = (row) => row?.querySelector('button') ?? null;
  const target = first(rows[index + 1]) || first(rows[index - 1]) || fallback;
  return target ? { current: target } : null;
}
