import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../src/utils/clientIp.js';

function fakeReq(ip, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ip, get: (name) => lower[name.toLowerCase()] };
}

afterEach(() => {
  delete process.env.CLIENT_IP_HEADER;
});

test('uses the socket address when CLIENT_IP_HEADER is unset, ignoring client headers', () => {
  assert.equal(clientIp(fakeReq('10.0.0.5', { 'CF-Connecting-IP': '203.0.113.9' })), '10.0.0.5');
});

test('uses the configured header, trimmed, when CLIENT_IP_HEADER is set', () => {
  process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
  assert.equal(clientIp(fakeReq('10.0.0.5', { 'CF-Connecting-IP': ' 203.0.113.9 ' })), '203.0.113.9');
});

test('matches the header name case-insensitively', () => {
  process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
  assert.equal(clientIp(fakeReq('10.0.0.5', { 'cf-connecting-ip': '2001:db8::1' })), '2001:db8::1');
});

test('falls back to the socket address when the header is missing or blank', () => {
  process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
  assert.equal(clientIp(fakeReq('10.0.0.5')), '10.0.0.5');
  assert.equal(clientIp(fakeReq('10.0.0.5', { 'cf-connecting-ip': '   ' })), '10.0.0.5');
});

test('treats a blank CLIENT_IP_HEADER as unset', () => {
  process.env.CLIENT_IP_HEADER = '  ';
  assert.equal(clientIp(fakeReq('10.0.0.5', { 'cf-connecting-ip': '203.0.113.9' })), '10.0.0.5');
});
