// Finds a form control through its label the way a screen reader (or
// Playwright's getByLabel) does: the label's `for` names the control's id, or
// the label wraps the control. Throws when the label doesn't lead to a control.
const CONTROLS = 'input, select, textarea';

export function fieldByLabel(container, text) {
  const label = [...container.querySelectorAll('label')].find((l) => l.textContent.includes(text));
  if (!label) throw new Error(`no <label> contains "${text}"`);
  const id = label.getAttribute('for');
  if (!id) {
    const wrapped = label.querySelector(CONTROLS);
    if (wrapped) return wrapped;
    throw new Error(`<label> "${text}" has no for and wraps no control`);
  }
  const target = [...container.querySelectorAll('[id]')].find((el) => el.getAttribute('id') === id);
  if (!target) throw new Error(`<label> "${text}" points at id "${id}", which is not in the page`);
  if (!target.matches(CONTROLS)) throw new Error(`<label> "${text}" points at a <${target.localName}>, not a form control`);
  return target;
}
