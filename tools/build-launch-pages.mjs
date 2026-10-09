// Pages Functions live at the project root, outside this public asset output.
// Deliberately copy only the site's public files, never the project wholesale.
import { copyFile, mkdir, readdir, lstat, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FILES = [
  'index.html', '404.html', 'downloads.html', 'gallery.html',
  'launch.html', 'launch-privacy.html', 'thank-you.html', 'reservation-terms.html',
  '_headers', '_redirects', '_routes.json', 'robots.txt',
  'favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png',
  'apple-touch-icon.png', 'm14.bin',
];
export const PUBLIC_DIRECTORIES = ['assets', 'css', 'js', 'img', 'updates', 'releases', 'marketapp'];
const BLOCKED_NAMES = new Set(['node_modules', 'functions', 'tools', 'docs', 'tests', 'build', 'dist']);

async function maybeStat(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function buildLaunchPages(sourceRoot, { branch = process.env.CF_PAGES_BRANCH } = {}) {
  const root = resolve(sourceRoot);
  const output = resolve(root, 'dist');
  for (const required of ['index.html', '404.html', '_routes.json']) {
    if (!(await maybeStat(resolve(root, required)))?.isFile()) throw new Error(`Required public file is missing: ${required}`);
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  let count = 0;
  async function copy(path, target) {
    const info = await maybeStat(path);
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error('Public assets must not be symbolic links');
    if (info.isDirectory()) {
      await mkdir(target, { recursive: true });
      for (const entry of await readdir(path)) {
        if (entry.startsWith('.') || BLOCKED_NAMES.has(entry)) continue;
        await copy(resolve(path, entry), resolve(target, entry));
      }
    } else if (info.isFile()) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(path, target);
      count++;
    }
  }
  // Keep this temporary browser-isolation page out of production and other previews.
  const previewFiles = branch === 'codex/corkbot-launch-funnel' ? ['challenge-check.html'] : [];
  for (const name of [...PUBLIC_FILES, ...PUBLIC_DIRECTORIES, ...previewFiles]) await copy(resolve(root, name), resolve(output, name));
  return { directory: output, files: count };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildLaunchPages(resolve(fileURLToPath(new URL('..', import.meta.url))));
  process.stdout.write(`Prepared ${result.files} public assets in dist. Pages Functions remain outside the static output.\n`);
}
