#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const usage = `
Usage:
  node tools/publish-release.mjs firmware <board-id> <version> <artifact-path> [options]
  node tools/publish-release.mjs desktop <platform-id> <version> <artifact-path> [options]

Options:
  --notes <text>                  Release notes. Repeat for multiple notes.
  --required                      Mark update as required.
  --released-at <iso-date>         Override release timestamp.
  --filename <name>                Override published filename.
  --signature <value>              Add detached signature metadata.
  --min-hardware-revision <value>  Firmware only.
  --max-hardware-revision <value>  Firmware only.
`;

const fail = (message) => {
  console.error(message);
  console.error(usage.trim());
  process.exit(1);
};

const parseOptions = (args) => {
  const options = { notes: [] };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--required') {
      options.required = true;
      continue;
    }

    const next = args[i + 1];
    if (!next || next.startsWith('--')) fail(`Missing value for ${arg}`);

    if (arg === '--notes') options.notes.push(next);
    else if (arg === '--released-at') options.releasedAt = next;
    else if (arg === '--filename') options.filename = next;
    else if (arg === '--signature') options.signature = next;
    else if (arg === '--min-hardware-revision') options.minHardwareRevision = next;
    else if (arg === '--max-hardware-revision') options.maxHardwareRevision = next;
    else fail(`Unknown option: ${arg}`);

    i += 1;
  }

  return options;
};

const safeSegment = (value, label) => {
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..')) {
    fail(`${label} must be a simple path segment.`);
  }

  return value;
};

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const writeJson = async (filePath, data) => writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);

const [kind, rawId, rawVersion, rawArtifactPath, ...rest] = process.argv.slice(2);
if (!kind || !rawId || !rawVersion || !rawArtifactPath) fail('Missing required arguments.');
if (!['firmware', 'desktop'].includes(kind)) fail('Release kind must be firmware or desktop.');

const id = safeSegment(rawId, kind === 'firmware' ? 'Board ID' : 'Platform ID');
const version = safeSegment(rawVersion, 'Version');
const options = parseOptions(rest);
const artifactPath = path.resolve(rawArtifactPath);
const artifactStats = await stat(artifactPath).catch(() => fail(`Artifact not found: ${artifactPath}`));
if (!artifactStats.isFile()) fail(`Artifact is not a file: ${artifactPath}`);

const manifestPath = path.join(repoRoot, 'updates', kind, 'latest.json');
const manifest = await readJson(manifestPath);
const collectionKey = kind === 'firmware' ? 'boards' : 'platforms';
const target = manifest[collectionKey]?.find((item) => item.id === id);
if (!target) {
  const known = (manifest[collectionKey] || []).map((item) => item.id).join(', ');
  fail(`Unknown ${kind === 'firmware' ? 'board' : 'platform'} ID "${id}". Known IDs: ${known}`);
}

const defaultFilename = kind === 'firmware' ? `${id}.bin` : path.basename(artifactPath);
const filename = safeSegment(options.filename || defaultFilename, 'Filename');
const releaseDir = path.join(repoRoot, 'releases', kind, id, version);
const destinationPath = path.join(releaseDir, filename);
const releaseUrl = `/releases/${kind}/${id}/${version}/${filename}`;
const releasedAt = options.releasedAt || new Date().toISOString();
const sha256 = await sha256File(artifactPath);

await mkdir(releaseDir, { recursive: true });
await copyFile(artifactPath, destinationPath);

const baseRelease = {
  version,
  releasedAt,
  required: Boolean(options.required),
  notes: options.notes
};

const release = kind === 'firmware'
  ? {
      ...baseRelease,
      minHardwareRevision: options.minHardwareRevision || null,
      maxHardwareRevision: options.maxHardwareRevision || null,
      firmware: {
        url: releaseUrl,
        size: artifactStats.size,
        sha256,
        signature: options.signature || null
      }
    }
  : {
      ...baseRelease,
      downloadUrl: releaseUrl,
      size: artifactStats.size,
      sha256,
      signature: options.signature || null
    };

target.latest = release;
target.releases = [
  release,
  ...(target.releases || []).filter((existing) => existing.version !== version)
];
manifest.generatedAt = releasedAt;

await writeJson(manifestPath, manifest);

console.log(`Published ${kind} ${id} ${version}`);
console.log(`Artifact: ${releaseUrl}`);
console.log(`SHA-256: ${sha256}`);
