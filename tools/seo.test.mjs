import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PUBLIC_FILES, PUBLIC_DIRECTORIES } from './build-launch-pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://corkrobotics.com';
const contentPaths = ['/how-it-works', '/uses/business-customization', '/uses/art-and-making', '/uses/robotics-learning'];
const read = (file) => readFile(resolve(root, file), 'utf8');
const head = (html) => html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => [match[1].toLowerCase(), match[3]]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => attributes(match[0]));
const meta = (html, field) => tags(head(html), 'meta').filter((tag) => tag.name === field || tag.property === field).map((tag) => tag.content);
const canonical = (html) => tags(head(html), 'link').filter((tag) => tag.rel === 'canonical').map((tag) => tag.href);
const fileFor = (url) => url.pathname === '/' ? 'index.html' : `${url.pathname.slice(1)}.html`;
async function publishedTarget(pathname) {
  const path = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidates = path ? [path, `${path}.html`, `${path}/index.html`] : ['index.html'];
  for (const candidate of candidates) {
    const published = PUBLIC_FILES.includes(candidate) || PUBLIC_DIRECTORIES.some((directory) => candidate.startsWith(`${directory}/`));
    if (!published) continue;
    try { if ((await lstat(resolve(root, candidate))).isFile()) return candidate; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  assert.fail(`Local target is absent from the published site: ${pathname}`);
}
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
  for (const path of ['/', '/launch', '/gallery', '/downloads', ...contentPaths]) assert.ok(values.includes(`${origin}${path}`));
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

test('indexable page sharing images use real public files at stable production URLs', async () => {
  for (const url of await sitemapUrls()) {
    const file = fileFor(url);
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

test('all indexable page navigation and media resolve to published targets without JavaScript', async () => {
  for (const url of await sitemapUrls()) {
    const path = url.pathname;
    const html = await read(fileFor(url));
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${path} needs one primary heading`);
    for (const { href } of tags(html, 'a')) {
      assert.ok(href && !/^(?:javascript|data):/i.test(href), `${path} has an invalid navigation link`);
      if (/^(?:mailto|tel):/.test(href)) continue;
      const url = new URL(href, `${origin}${path}`);
      if (url.origin !== origin) { assert.equal(url.protocol, 'https:'); continue; }
      const target = await publishedTarget(url.pathname);
      if (target.endsWith('.html')) {
        const targetCanonical = canonical(await read(target))[0];
        if (targetCanonical) assert.equal(url.pathname, new URL(targetCanonical).pathname, `${path} links through an avoidable HTML or trailing-slash redirect: ${href}`);
      }
      if (url.hash) {
        const targetHtml = await read(target);
        const ids = [...targetHtml.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map((match) => match[2]);
        assert.ok(ids.includes(decodeURIComponent(url.hash.slice(1))), `${path} links to a missing anchor: ${href}`);
      }
    }
    for (const { href, rel } of tags(head(html), 'link')) {
      if (href?.startsWith('/') && !href.startsWith('//') && /stylesheet|icon|preload/.test(rel)) await publishedTarget(new URL(href, origin).pathname);
    }
    for (const { src } of tags(html, 'img')) if (src) await publishedTarget(new URL(src, origin).pathname);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(main, `${path} needs crawlable main content`);
    for (const image of tags(main, 'img')) {
      assert.ok(image.alt?.trim(), `${path} content images need a useful text alternative`);
      assert.ok(Number(image.width) > 0 && Number(image.height) > 0, `${path} content images need intrinsic dimensions`);
      const url = new URL(image.src, origin);
      assert.equal(url.origin, origin);
      await publishedTarget(url.pathname);
    }
    for (const { srcset } of [...tags(main, 'source'), ...tags(main, 'img')]) {
      if (!srcset) continue;
      for (const candidate of srcset.split(',')) await publishedTarget(new URL(candidate.trim().split(/\s+/)[0], origin).pathname);
    }
    for (const { poster } of tags(main, 'video')) if (poster) await publishedTarget(new URL(poster, origin).pathname);
  }
});

test('site structured data parses and agrees with page identity, public logo and real breadcrumb links', async () => {
  for (const path of ['/', ...contentPaths]) {
    const url = `${origin}${path}`;
    const html = await read(fileFor(new URL(url)));
    const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    if (path === '/') assert.ok(blocks.length, 'Homepage organization and website identity must remain present');
    const breadcrumb = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].find((match) => attributes(match[1]).class?.split(/\s+/).includes('guide-breadcrumb'));
    let breadcrumbCount = 0;
    for (const [, source] of blocks) {
      const data = JSON.parse(source);
      assert.match(data['@context'], /^https:\/\/schema\.org\/?$/);
      const nodes = data['@graph'] || [data];
      for (const node of nodes) {
        if (node['@type'] === 'Organization' || node['@type'] === 'WebSite') {
          assert.equal(node.url, `${origin}/`);
          assert.ok(node.name?.trim());
          if (node['@type'] === 'Organization') {
            const logo = new URL(typeof node.logo === 'string' ? node.logo : node.logo?.url);
            assert.equal(logo.origin, origin);
            await publishedTarget(logo.pathname);
          }
        }
        if (node['@type'] === 'WebPage') {
          assert.equal(node.url, url);
          assert.ok(node.name?.trim());
        }
        if (node['@type'] === 'BreadcrumbList') {
          breadcrumbCount++;
          assert.ok(breadcrumb, `${path} breadcrumb data needs visible navigation`);
          const items = node.itemListElement;
          const visible = [...breadcrumb[2].matchAll(/<(a|span)\b([^>]*)>([\s\S]*?)<\/\1>/g)]
            .filter((match) => match[1] === 'a' || attributes(match[2])['aria-current'] === 'page')
            .map((match) => ({ name: match[3].replace(/<[^>]+>/g, '').trim(), href: attributes(match[2]).href }));
          assert.ok(Array.isArray(items) && items.length > 1);
          assert.deepEqual(items.map((item) => item.name), visible.map((item) => item.name));
          assert.deepEqual(items.map((item) => item.position), items.map((_, index) => index + 1));
          for (const [index, item] of items.entries()) {
            assert.ok(item.name?.trim());
            if (!item.item && index === items.length - 1) continue;
            const destination = new URL(typeof item.item === 'string' ? item.item : item.item?.['@id']);
            assert.equal(destination.origin, origin);
            await publishedTarget(destination.pathname);
            if (visible[index].href) assert.equal(destination.href, new URL(visible[index].href, url).href);
            if (destination.hash) {
              const destinationHtml = await read(await publishedTarget(destination.pathname));
              const ids = [...destinationHtml.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map((match) => match[2]);
              assert.ok(ids.includes(decodeURIComponent(destination.hash.slice(1))));
            }
          }
          const last = items.at(-1).item;
          if (last) assert.equal(typeof last === 'string' ? last : last['@id'], url);
        }
      }
    }
    if (contentPaths.includes(path)) assert.equal(breadcrumbCount, 1, `${path} must describe its visible breadcrumb trail exactly once`);
  }
});
