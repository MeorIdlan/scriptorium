// The auth pages (card uqVctsf5): a lancet window above every card, and a code field that is
// set apart. Behaviour is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import Login from '../src/pages/auth/Login.jsx';
import Register from '../src/pages/auth/Register.jsx';
import VerifyOtp from '../src/pages/auth/VerifyOtp.jsx';
import PasskeySetup from '../src/pages/auth/PasskeySetup.jsx';

// Signed out, as a visitor reaches these pages
const signedOut = { 'GET /auth/me': () => { throw new Error('401'); } };

for (const [name, page] of Object.entries({ Login, Register, VerifyOtp, PasskeySetup })) {
  test(`${name} has a lancet above its card`, async () => {
    const view = await renderApp(h(page), { routes: signedOut });
    const root = view.query('.auth-page');
    assert.ok(root, 'no .auth-page');
    const lancet = root.firstElementChild;
    assert.ok(lancet.classList.contains('lancet'), 'the lancet comes first');
    assert.equal(lancet.getAttribute('aria-hidden'), 'true');
    assert.ok(root.querySelector('.auth-card'), 'the card is still there');
    await view.unmount();
  });
}

test('the one-time code field is set apart from the other fields', async () => {
  const view = await renderApp(h(VerifyOtp), { routes: signedOut });
  // The page asks for the email, then the six-digit code
  const fields = view.queryAll('.auth-card input');
  assert.equal(fields.length, 2);
  const codeField = fields[1];
  assert.ok(codeField.classList.contains('otp-input'));
  await view.unmount();
});
