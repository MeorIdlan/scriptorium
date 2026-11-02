// podman-compose 1.0.6 stops on a service using an undeclared default network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('production compose declares the default network it uses', () => {
  const text = fs.readFileSync(path.join(ROOT, 'docker-compose.prod.yml'), 'utf8');
  const networks = text.slice(text.search(/^networks:$/m));
  assert.match(networks, /^ {2}default:$/m);
});
