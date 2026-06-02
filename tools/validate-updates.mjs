#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const errors = [];
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const requiredFirmwareIds = ['main-board', 'sensor-board'];
const requiredDesktopIds = ['macos-arm64', 'macos-x64', 'windows-x64', 'linux-x64'];

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const artifactPathFromUrl = (url) => {
  if (!url || !url.startsWith('/releases/')) return null;
  return path.join(repoRoot, url);
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return [];
  }

  return value;
};

const checkReleaseMetadata = ({ label, release, kind }) => {
  if (!isObject(release)) {
    errors.push(`${label}: release must be an object.`);
    return false;
  }

  if (!semverPattern.test(release.version || '')) {
    errors.push(`${label}: version must be a semantic version string.`);
  }

  if (!isIsoDate(release.releasedAt)) {
    errors.push(`${label}: releasedAt must be an ISO-8601 date string.`);
  }

  if (typeof release.required !== 'boolean') {
    errors.push(`${label}: required must be a boolean.`);
  }

  if (!Array.isArray(release.notes)) {
    errors.push(`${label}: notes must be an array.`);
  }

  if (kind === 'firmware') {
    if (!('minHardwareRevision' in release)) {
      errors.push(`${label}: minHardwareRevision must be present (null allowed).`);
    }
    if (!('maxHardwareRevision' in release)) {
      errors.push(`${label}: maxHardwareRevision must be present (null allowed).`);
    }
  }

  return true;
};

const checkArtifact = async ({ label, url, size, sha256, expectedPrefix }) => {
  if (typeof url !== 'string' || !url.startsWith(expectedPrefix)) {
    errors.push(`${label}: artifact URL must start with ${expectedPrefix}.`);
    return;
  }

  if (!isPositiveInteger(size)) {
    errors.push(`${label}: size must be a positive integer.`);
    return;
  }

  if (typeof sha256 !== 'string' || !sha256Pattern.test(sha256)) {
    errors.push(`${label}: sha256 must be a 64-character lowercase hex digest.`);
    return;
  }

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
  if (manifest.manifestType !== 'cork-robotics-firmware') {
    errors.push('firmware: manifestType must be cork-robotics-firmware.');
  }
  if (manifest.updateMode !== 'app-assisted-board-pull') {
    errors.push('firmware: updateMode must be app-assisted-board-pull.');
  }
  if (manifest.artifactBasePath !== '/releases/firmware') {
    errors.push('firmware: artifactBasePath must be /releases/firmware.');
  }

  const boards = requireArray(manifest.boards, 'firmware: boards');
  const ids = new Set();

  for (const board of boards) {
    if (!isObject(board)) {
      errors.push('firmware: each board entry must be an object.');
      continue;
    }

    if (ids.has(board.id)) errors.push(`firmware: duplicate board ID ${board.id}.`);
    ids.add(board.id);
    if (!Array.isArray(board.releases)) {
      errors.push(`firmware ${board.id}: releases must be an array.`);
    }

    if (board.latest) {
      checkReleaseMetadata({
        label: `firmware ${board.id} latest`,
        release: board.latest,
        kind: 'firmware'
      });
      const latestInReleases = (board.releases || []).some((release) => release.version === board.latest.version);
      if (!latestInReleases) errors.push(`firmware ${board.id}: latest version is not listed in releases.`);
      await checkArtifact({
        label: `firmware ${board.id} latest ${board.latest.version}`,
        url: board.latest.firmware?.url,
        size: board.latest.firmware?.size,
        sha256: board.latest.firmware?.sha256,
        expectedPrefix: `/releases/firmware/${board.id}/${board.latest.version}/`
      });
    } else if (board.latest !== null) {
      errors.push(`firmware ${board.id}: latest must be null or a release object.`);
    }

    for (const release of board.releases || []) {
      checkReleaseMetadata({
        label: `firmware ${board.id} ${release.version || '<missing-version>'}`,
        release,
        kind: 'firmware'
      });
      await checkArtifact({
        label: `firmware ${board.id} ${release.version}`,
        url: release.firmware?.url,
        size: release.firmware?.size,
        sha256: release.firmware?.sha256,
        expectedPrefix: `/releases/firmware/${board.id}/${release.version}/`
      });
    }
  }

  for (const requiredId of requiredFirmwareIds) {
    if (!ids.has(requiredId)) {
      errors.push(`firmware: missing required board ID ${requiredId}.`);
    }
  }
};

const checkDesktop = async () => {
  const manifest = await readJson(path.join(repoRoot, 'updates/desktop/latest.json'));
  if (manifest.manifestType !== 'cork-robotics-desktop') {
    errors.push('desktop: manifestType must be cork-robotics-desktop.');
  }
  if (manifest.artifactBasePath !== '/releases/desktop') {
    errors.push('desktop: artifactBasePath must be /releases/desktop.');
  }

  const platforms = requireArray(manifest.platforms, 'desktop: platforms');
  const ids = new Set();

  for (const platform of platforms) {
    if (!isObject(platform)) {
      errors.push('desktop: each platform entry must be an object.');
      continue;
    }

    if (ids.has(platform.id)) errors.push(`desktop: duplicate platform ID ${platform.id}.`);
    ids.add(platform.id);
    if (!Array.isArray(platform.releases)) {
      errors.push(`desktop ${platform.id}: releases must be an array.`);
    }

    if (platform.latest) {
      checkReleaseMetadata({
        label: `desktop ${platform.id} latest`,
        release: platform.latest,
        kind: 'desktop'
      });
      const latestInReleases = (platform.releases || []).some((release) => release.version === platform.latest.version);
      if (!latestInReleases) errors.push(`desktop ${platform.id}: latest version is not listed in releases.`);
      await checkArtifact({
        label: `desktop ${platform.id} latest ${platform.latest.version}`,
        url: platform.latest.downloadUrl,
        size: platform.latest.size,
        sha256: platform.latest.sha256,
        expectedPrefix: `/releases/desktop/${platform.id}/${platform.latest.version}/`
      });
    } else if (platform.latest !== null) {
      errors.push(`desktop ${platform.id}: latest must be null or a release object.`);
    }

    for (const release of platform.releases || []) {
      checkReleaseMetadata({
        label: `desktop ${platform.id} ${release.version || '<missing-version>'}`,
        release,
        kind: 'desktop'
      });
      await checkArtifact({
        label: `desktop ${platform.id} ${release.version}`,
        url: release.downloadUrl,
        size: release.size,
        sha256: release.sha256,
        expectedPrefix: `/releases/desktop/${platform.id}/${release.version}/`
      });
    }
  }

  for (const requiredId of requiredDesktopIds) {
    if (!ids.has(requiredId)) {
      errors.push(`desktop: missing required platform ID ${requiredId}.`);
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
