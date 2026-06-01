#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const errors = [];

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const artifactPathFromUrl = (url) => {
  if (!url || !url.startsWith('/releases/')) return null;
  return path.join(repoRoot, url);
};

const checkArtifact = async ({ label, url, size, sha256 }) => {
  const artifactPath = artifactPathFromUrl(url);
  if (!artifactPath) {
    errors.push(`${label}: artifact URL must start with /releases/.`);
    return;
  }

  let artifactStats;
  try {
    artifactStats = await stat(artifactPath);
  } catch {
    errors.push(`${label}: missing artifact ${url}.`);
    return;
  }

  if (!artifactStats.isFile()) errors.push(`${label}: artifact is not a file ${url}.`);
  if (typeof size === 'number' && artifactStats.size !== size) {
    errors.push(`${label}: expected size ${size}, found ${artifactStats.size}.`);
  }

  if (sha256) {
    const actualSha256 = await sha256File(artifactPath);
    if (actualSha256 !== sha256) {
      errors.push(`${label}: SHA-256 mismatch. Expected ${sha256}, found ${actualSha256}.`);
    }
  }
};

const checkFirmware = async () => {
  const manifest = await readJson(path.join(repoRoot, 'updates/firmware/latest.json'));
  const ids = new Set();

  for (const board of manifest.boards || []) {
    if (ids.has(board.id)) errors.push(`firmware: duplicate board ID ${board.id}.`);
    ids.add(board.id);

    if (board.latest) {
      const latestInReleases = (board.releases || []).some((release) => release.version === board.latest.version);
      if (!latestInReleases) errors.push(`firmware ${board.id}: latest version is not listed in releases.`);
      await checkArtifact({
        label: `firmware ${board.id} latest ${board.latest.version}`,
        url: board.latest.firmware?.url,
        size: board.latest.firmware?.size,
        sha256: board.latest.firmware?.sha256
      });
    }

    for (const release of board.releases || []) {
      await checkArtifact({
        label: `firmware ${board.id} ${release.version}`,
        url: release.firmware?.url,
        size: release.firmware?.size,
        sha256: release.firmware?.sha256
      });
    }
  }
};

const checkDesktop = async () => {
  const manifest = await readJson(path.join(repoRoot, 'updates/desktop/latest.json'));
  const ids = new Set();

  for (const platform of manifest.platforms || []) {
    if (ids.has(platform.id)) errors.push(`desktop: duplicate platform ID ${platform.id}.`);
    ids.add(platform.id);

    if (platform.latest) {
      const latestInReleases = (platform.releases || []).some((release) => release.version === platform.latest.version);
      if (!latestInReleases) errors.push(`desktop ${platform.id}: latest version is not listed in releases.`);
      await checkArtifact({
        label: `desktop ${platform.id} latest ${platform.latest.version}`,
        url: platform.latest.downloadUrl,
        size: platform.latest.size,
        sha256: platform.latest.sha256
      });
    }

    for (const release of platform.releases || []) {
      await checkArtifact({
        label: `desktop ${platform.id} ${release.version}`,
        url: release.downloadUrl,
        size: release.size,
        sha256: release.sha256
      });
    }
  }
};

await checkFirmware();
await checkDesktop();

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Update manifests are valid.');
