import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'worker.js'), 'utf8');
const files = {
  __UI_HTML__: 'src/index.html',
  __UI_CSS__: ['src/styles.css', 'src/brand.css'],
  __UI_JS__: 'src/app.js',
  __SOURCE_SKILL__: '.cursor/skills/source-evaluation/SKILL.md',
};
let output = source;
for (const [token, filename] of Object.entries(files)) {
  const value = Array.isArray(filename)
    ? (await Promise.all(filename.map(file => readFile(path.join(root, file), 'utf8')))).join('\n')
    : await readFile(path.join(root, filename), 'utf8');
  if (!output.includes(token)) throw new Error(`Missing build token: ${token}`);
  output = output.replace(token, JSON.stringify(value));
}
const dist = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
await mkdir(path.join(dist, 'server'), { recursive: true });
await mkdir(path.join(dist, '.openai'), { recursive: true });
await mkdir(publicDir, { recursive: true });
await writeFile(path.join(dist, 'server', 'index.js'), output);
await copyFile(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));
await copyFile(path.join(root, 'src', 'index.html'), path.join(publicDir, 'index.html'));
await copyFile(path.join(root, 'src', 'app.js'), path.join(publicDir, 'app.js'));
await writeFile(path.join(publicDir, 'styles.css'), (await Promise.all(['styles.css', 'brand.css'].map(file => readFile(path.join(root, 'src', file), 'utf8')))).join('\n'));
console.log('Built dist/server/index.js');
