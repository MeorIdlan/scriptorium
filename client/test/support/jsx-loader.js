// node --test loader hooks: compile .jsx with esbuild, and turn CSS imports
// into empty modules so components can be imported outside Vite
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', source: '', shortCircuit: true };
  }
  if (url.endsWith('.jsx')) {
    const path = fileURLToPath(url);
    const { code } = await transform(await readFile(path, 'utf8'), {
      loader: 'jsx',
      jsx: 'automatic',
      format: 'esm',
      sourcefile: path,
      sourcemap: 'inline',
    });
    return { format: 'module', source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
