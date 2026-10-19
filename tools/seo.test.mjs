import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PUBLIC_FILES } from './build-launch-pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://corkrobotics.com';
const read = (file) => readFile(resolve(root, file), 'utf8');
const head = (html) => html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => [match[1].toLowerCase(), match[3]]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => attributes(match[0]));
const meta = (html, field) => tags(head(html), 'meta').filter((tag) => tag.name === field || tag.property === field).map((tag) => tag.content);
const canonical = (html) => tags(head(html), 'link').filter((tag) => tag.rel === 'canonical').map((tag) => tag.href);
const fileFor = (url) => url.pathname === '/' ? 'index.html' : `${url.pathname.slice(1)}.html`;
const sitemapUrls = async () => {
  const xml = await read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
};

test('robots advertises the shipped sitemap and leaves pages and images crawlable', async () => {
  const robots = await read('robots.txt');
  const sitemapLines = robots.split(/\r?\n/).filter((line) => /^Sitemap:/i.test(line));
  assert.deepEqual(sitemapLines, [`Sitemap: ${origin}/sitemap.xml`]);
  assert.match(robots, /^User-agent:\s*\*\s*$/m);
  assert.match(robots, /^Allow:\s*\/\s*$/m);
  assert.doesNotMatch(robots, /^Disallow:\s*\S/m);
  assert.ok(PUBLIC_FILES.includes('robots.txt'));
  assert.ok(PUBLIC_FILES.includes('sitemap.xml'));
});

test('sitemap destinations resolve to distinct indexable HTML pages with matching clean canonicals', async () => {
  const urls = await sitemapUrls();
  const values = urls.map((url) => url.href);
  assert.equal(new Set(values).size, values.length);
  for (const path of ['/', '/launch', '/gallery', '/downloads']) assert.ok(values.includes(`${origin}${path}`));
  const titles = new Set();
  const descriptions = new Set();
  for (const url of urls) {
    assert.equal(url.origin, origin);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.doesNotMatch(url.pathname, /\.html$/);
    if (url.pathname !== '/') assert.ok(!url.pathname.endsWith('/'));
    const file = fileFor(url);
    assert.ok(PUBLIC_FILES.includes(file), `${file} must be published by the static build`);
    const html = await read(file);
    assert.match(html, /<html\b[^>]*\blang="en"/);
    assert.deepEqual(canonical(html), [url.href], `${file} canonical must match the sitemap and redirect target`);
    assert.ok(!meta(html, 'robots').some((value) => /\bnoindex\b/i.test(value)));
    const title = head(html).match(/<title>([\s\S]*?)<\/title>/)?.[1].trim();
    const descriptionsForPage = meta(html, 'description');
    assert.ok(title && !titles.has(title), `${file} needs a unique title`);
    assert.equal(descriptionsForPage.length, 1);
    assert.ok(descriptionsForPage[0] && !descriptions.has(descriptionsForPage[0]), `${file} needs a unique description`);
    titles.add(title);
    descriptions.add(descriptionsForPage[0]);
  }
});

test('temporary apparel, confirmation, privacy and retired reservation pages stay out of search', async () => {
  const paths = ['/support', '/thank-you', '/launch-privacy', '/reservation-terms', '/404'];
  const sitemap = new Set((await sitemapUrls()).map((url) => url.pathname));
  for (const path of paths) {
    assert.ok(!sitemap.has(path));
    const html = await read(`${path.slice(1)}.html`);
    assert.ok(meta(html, 'robots').some((value) => /\bnoindex\b/.test(value)), `${path} needs a crawler-readable noindex`);
  }
});

test('campaign sharing images use real public files at stable production URLs', async () => {
  for (const file of ['index.html', 'launch.html']) {
    const html = await read(file);
    for (const field of ['og:image', 'twitter:image']) {
      const imageValues = meta(html, field);
      assert.equal(imageValues.length, 1, `${file} needs exactly one ${field}`);
      const url = new URL(imageValues[0]);
      assert.equal(url.origin, origin);
      assert.equal(url.search, '');
      assert.equal(url.hash, '');
      assert.doesNotMatch(url.pathname, /dev-preview|mobile-poster/);
      assert.ok((await lstat(resolve(root, url.pathname.slice(1)))).isFile());
    }
    assert.deepEqual(meta(html, 'twitter:card'), ['summary_large_image']);
    assert.ok(meta(html, 'og:image:alt')[0]);
    assert.equal(meta(html, 'og:url')[0], canonical(html)[0]);
  }
});
