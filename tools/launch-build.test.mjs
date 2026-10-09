import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { buildLaunchPages } from './build-launch-pages.mjs';

async function fixture(files) {
  const root = await mkdtemp(resolve(tmpdir(), 'launch-static-test-'));
  const entries = { 'index.html': '<html>Existing site</html>', '404.html': '<html>Not found</html>', '_routes.json': '{"version":1,"include":["/api/launch/*"],"exclude":[]}', ...files };
  for (const [path, body] of Object.entries(entries)) { await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), body); }
  return root;
}

test('public build preserves legacy and launch assets while excluding backend, secrets, tools and generated products', async () => {
  const root = await fixture({
    'launch.html': 'launch', 'launch-privacy.html': 'privacy', 'thank-you.html': 'thanks', 'reservation-terms.html': 'terms',
    '_headers': 'headers', '_redirects': 'redirects',
    'assets/css/product.css': 'css', 'assets/media/film.mp4': 'movie', 'js/main.js': 'js',
    'marketapp/downloads/latest.json': 'market manifest', 'marketapp/downloads/MarketApp.zip': 'binary',
    'updates/firmware/latest.json': 'firmware manifest', 'releases/firmware/image.bin': 'firmware', 'm14.bin': 'legacy firmware',
    'functions/api/launch/subscribe.js': 'backend', 'docs/setup.md': 'docs', 'tools/tests.mjs': 'tests', '.dev.vars': 'secret',
    'assets/.env': 'secret', 'assets/node_modules/private.js': 'dependency', 'assets/build/compiler.bin': 'compiler', 'package.json': 'tool config',
  });
  try {
    const output = await buildLaunchPages(root);
    for (const path of ['launch.html', 'launch-privacy.html', 'thank-you.html', 'reservation-terms.html', '_routes.json', '_headers', '_redirects', 'assets/css/product.css', 'assets/media/film.mp4', 'js/main.js', 'marketapp/downloads/latest.json', 'marketapp/downloads/MarketApp.zip', 'updates/firmware/latest.json', 'releases/firmware/image.bin', 'm14.bin']) {
      assert.deepEqual(await readFile(resolve(output.directory, path)), await readFile(resolve(root, path)));
    }
    for (const path of ['functions/api/launch/subscribe.js', 'docs/setup.md', 'tools/tests.mjs', '.dev.vars', 'assets/.env', 'assets/node_modules/private.js', 'assets/build/compiler.bin', 'package.json']) {
      await assert.rejects(lstat(resolve(output.directory, path)), { code: 'ENOENT' });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('sparse development fixture can omit optional release trees without pretending they were verified', async () => {
  const root = await fixture({ 'launch.html': 'launch' });
  try { assert.equal((await buildLaunchPages(root)).files, 4); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test('build refuses source symlinks and requires the site and invocation route files', async () => {
  const root = await fixture({});
  try {
    await mkdir(resolve(root, 'assets'));
    await symlink(resolve(root, 'index.html'), resolve(root, 'assets', 'private-link.html'));
    await assert.rejects(buildLaunchPages(root), /symbolic links/);
    await rm(resolve(root, '_routes.json'));
    await assert.rejects(buildLaunchPages(root), /Required public file/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
