// Focus bookkeeping for linkedom, which dispatches focus events but never
// records the focused element, so document.activeElement is always undefined.
// Test infrastructure only, like the innerText shim in render.js: it models
// what a browser does (focus() makes an element active, blur() clears it,
// a removed element stops being active). Import it after render.js.
const { window } = globalThis;
const { document } = window;
const proto = window.HTMLElement.prototype;
const nativeFocus = proto.focus;
const nativeBlur = proto.blur;
let focused = null;

proto.focus = function (...args) {
  if (this.isConnected) focused = this;
  return nativeFocus.apply(this, args);
};

proto.blur = function (...args) {
  if (focused === this) focused = null;
  return nativeBlur.apply(this, args);
};

Object.defineProperty(document, 'activeElement', {
  configurable: true,
  get() {
    return focused && focused.isConnected ? focused : document.body;
  },
});
