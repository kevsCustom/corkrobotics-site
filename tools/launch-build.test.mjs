import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
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

test('temporary browser checks are published only to the exact launch feature preview and removed by later non-preview builds', async () => {
  const pages = { 'challenge-check.html': '<html>Browser check</html>', 'challenge-check-explicit.html': '<html>Explicit browser check</html>' };
  const root = await fixture(pages);
  try {
    const preview = await buildLaunchPages(root, { branch: 'codex/corkbot-launch-funnel' });
    for (const [page, body] of Object.entries(pages)) assert.equal(await readFile(resolve(preview.directory, page), 'utf8'), body);
    for (const branch of ['', 'main', 'production', 'codex/other-preview', 'codex/corkbot-launch-funnel-copy']) {
      const output = await buildLaunchPages(root, { branch });
      for (const page of Object.keys(pages)) await assert.rejects(lstat(resolve(output.directory, page)), { code: 'ENOENT' });
      assert.equal(await readFile(resolve(output.directory, 'index.html'), 'utf8'), '<html>Existing site</html>');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('build reads the Cloudflare branch environment and excludes the temporary check when it is unset', async () => {
  const pages = { 'challenge-check.html': 'browser check', 'challenge-check-explicit.html': 'explicit browser check' };
  const root = await fixture(pages);
  const script = `import { buildLaunchPages } from ${JSON.stringify(new URL('./build-launch-pages.mjs', import.meta.url).href)}; await buildLaunchPages(process.argv[1]);`;
  try {
    for (const branch of [undefined, 'codex/corkbot-launch-funnel', 'main']) {
      const env = { ...process.env };
      if (branch === undefined) delete env.CF_PAGES_BRANCH;
      else env.CF_PAGES_BRANCH = branch;
      execFileSync(process.execPath, ['--input-type=module', '-e', script, root], { env });
      if (branch === 'codex/corkbot-launch-funnel') {
        for (const [page, body] of Object.entries(pages)) assert.equal(await readFile(resolve(root, 'dist', page), 'utf8'), body);
      } else {
        for (const page of Object.keys(pages)) await assert.rejects(lstat(resolve(root, 'dist', page)), { code: 'ENOENT' });
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('temporary implicit check uses the canonical widget without signup requests or token handling', async () => {
  const html = await readFile(fileURLToPath(new URL('../challenge-check.html', import.meta.url)), 'utf8');
  assert.match(html, /<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js" async defer><\/script>/);
  assert.match(html, /class="cf-turnstile"/);
  assert.match(html, /data-sitekey="0x4AAAAAAFSduqvXzwc75pqD"/);
  assert.match(html, /data-action="launch_signup"/);
  assert.doesNotMatch(html, /<form\b|<input\b|\/api\/|fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|console\.|turnstile\.(?:render|reset|execute|ready)|data-(?:retry|timeout|size|refresh)/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  const status = { textContent: 'Checking your browser…' };
  const context = { document: { getElementById: (id) => { assert.equal(id, 'challenge-status'); return status; } } };
  runInNewContext(scripts[0], context);
  assert.equal(context.onChallengeCheckSuccess.length, 0);
  context.onChallengeCheckSuccess('PRIVATE_TEST_TOKEN');
  assert.equal(status.textContent, 'Browser verified.');
  assert.equal(JSON.stringify(context).includes('PRIVATE_TEST_TOKEN'), false);
  context.onChallengeCheckExpired();
  assert.equal(status.textContent, 'Checking your browser…');
});

test('temporary explicit check renders after the container with only the required key, action, and token-ignoring status callbacks', async () => {
  const html = await readFile(fileURLToPath(new URL('../challenge-check-explicit.html', import.meta.url)), 'utf8');
  assert.match(html, /<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?onload=onExplicitChallengeLoaded&amp;render=explicit" async defer><\/script>/);
  assert.match(html, /<div id="challenge-widget"><\/div>/);
  assert.doesNotMatch(html, /class="cf-turnstile"|<form\b|<input\b|\/api\/|fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|console\.|turnstile\.(?:reset|execute|ready)|data-(?:retry|timeout|size|refresh)/);
  assert.ok(html.indexOf('id="challenge-widget"') < html.indexOf('function onExplicitChallengeLoaded'));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  const status = { textContent: 'Checking your browser…' };
  let options;
  let renders = 0;
  const context = {
    document: { getElementById: (id) => { assert.equal(id, 'challenge-status'); return status; } },
    window: { turnstile: { render: (selector, value) => { assert.equal(selector, '#challenge-widget'); options = value; renders++; } } },
  };
  runInNewContext(scripts[0], context);
  context.onExplicitChallengeLoaded();
  assert.equal(renders, 1);
  assert.deepEqual(Object.keys(options).sort(), ['action', 'callback', 'expired-callback', 'sitekey']);
  assert.equal(options.sitekey, '0x4AAAAAAFSduqvXzwc75pqD');
  assert.equal(options.action, 'launch_signup');
  assert.equal(options.callback.length, 0);
  options.callback('PRIVATE_TEST_TOKEN');
  assert.equal(status.textContent, 'Browser verified.');
  assert.equal(JSON.stringify(context).includes('PRIVATE_TEST_TOKEN'), false);
  options['expired-callback']();
  assert.equal(status.textContent, 'Checking your browser…');
});
