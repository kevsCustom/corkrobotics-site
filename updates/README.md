# Cork Robotics Update Manifests

This folder contains the public update contract for Cork Robotics apps and ESP32 OTA firmware.

Production endpoints:

- Firmware: `/updates/firmware/latest.json`
- Desktop app: `/updates/desktop/latest.json`

Both manifests are intentionally served with `Cache-Control: no-store` from `_headers`. Apps should still request them with caching disabled.

These IDs are release-contract identifiers. Do not rename them without coordinating app clients, OTA board handlers, and manifest validation together.

- Firmware board IDs: `main-board`, `sensor-board`
- Desktop platform IDs: `macos-arm64`, `macos-x64`, `windows-x64`, `linux-x64`

## Firmware OTA

Apps should request `/updates/firmware/latest.json` with caching disabled. Each board entry represents one update channel:

- `main-board`: primary ESP32 controller firmware.
- `sensor-board`: sensor ESP32 firmware.

Current launch state has `latest: null` for each board, which means no firmware update is published yet.

When a firmware release is ready, prefer the publisher script:

```sh
node tools/publish-release.mjs firmware main-board 1.0.0 ./build/main-board.bin --notes "Initial production firmware."
node tools/publish-release.mjs firmware sensor-board 1.0.0 ./build/sensor-board.bin --notes "Initial production firmware."
node tools/validate-updates.mjs
```

Manual publishing steps, if needed:

1. Add the firmware binary under `/releases/firmware/<board-id>/<version>/<board-id>.bin`.
2. Calculate the binary size and SHA-256 digest.
3. Add a release object to that board's `releases` array.
4. Copy that same release object into the board's `latest` field.

The publisher script already performs steps 1-4 for the manifest entry and computes both `size` and `sha256`. The validator requires both fields and checks them against the on-disk artifact.

Firmware release shape:

```json
{
  "version": "1.0.0",
  "releasedAt": "2026-06-01T00:00:00Z",
  "required": false,
  "minHardwareRevision": null,
  "maxHardwareRevision": null,
  "notes": [
    "Initial production firmware."
  ],
  "firmware": {
    "url": "/releases/firmware/main-board/1.0.0/main-board.bin",
    "size": 524288,
    "sha256": "replace-with-64-character-sha256",
    "signature": null
  }
}
```

Apps can compare a board's installed semantic version with `latest.version`. When an update is accepted, the app should send the board the resolved absolute HTTPS firmware URL, expected byte size, and expected SHA-256 so the ESP32 can download over HTTPS and verify the image.

ESP32 boards should not need to parse the full manifest. The phone or desktop app can resolve the relative `firmware.url` against the site origin, then pass the board:

- Absolute HTTPS firmware URL.
- Expected SHA-256.
- Expected byte size.
- Target version.
- Required flag.

The board should download over TLS, verify the SHA-256 before booting the image, then report the installed firmware version back to the app after reboot.

This flow is the canonical `app-assisted-board-pull` OTA mode for drawBot. The manifest is app-facing, while the board-facing command payload is a reduced release contract. See `agent_memory/shared/OTA_APP_ASSISTED_BOARD_PULL_CONTRACT.md` for the tighter handoff rules.

## Desktop App

Desktop update checks should request `/updates/desktop/latest.json` with caching disabled, select the matching platform, and compare the installed semantic version with `latest.version`.

Current launch state has `latest: null` for each platform, which means no desktop update is published yet.

When a desktop release is ready, prefer the publisher script:

```sh
node tools/publish-release.mjs desktop macos-arm64 1.0.0 ./dist/Cork-Robotics-1.0.0-arm64.dmg --notes "Initial desktop release."
node tools/publish-release.mjs desktop windows-x64 1.0.0 ./dist/Cork-Robotics-Setup-1.0.0.exe --notes "Initial desktop release."
node tools/validate-updates.mjs
```

Manual publishing steps, if needed:

1. Add the installer/archive under `/releases/desktop/<platform-id>/<version>/`.
2. Calculate the binary size and SHA-256 digest.
3. Add a release object to that platform's `releases` array.
4. Copy that same release object into the platform's `latest` field.

The publisher script computes `size` and `sha256`. The validator requires both fields and verifies that the artifact on disk still matches the manifest.

Desktop release shape:

```json
{
  "version": "1.0.0",
  "releasedAt": "2026-06-01T00:00:00Z",
  "required": false,
  "notes": [
    "Initial desktop release."
  ],
  "downloadUrl": "/releases/desktop/macos-arm64/1.0.0/Cork-Robotics-1.0.0-arm64.dmg",
  "size": 73400320,
  "sha256": "replace-with-64-character-sha256",
  "signature": null
}
```

## Update Check Rules

Client apps should:

1. Fetch the relevant manifest with caching disabled.
2. Find the matching board or platform ID.
3. Treat `latest: null` as no update.
4. Compare semantic versions. Offer an update only when `latest.version` is newer than the installed version.
5. Resolve relative artifact URLs against the website origin.
6. Verify SHA-256 after download.
7. Respect `required: true` when present by blocking normal use until the update is installed.
