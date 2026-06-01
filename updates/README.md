# Cork Robotics Update Manifests

This folder contains the public update contract for Cork Robotics apps.

## Firmware OTA

Apps should request `/updates/firmware/latest.json` with caching disabled. Each board entry represents one update channel:

- `main-board`: primary ESP32 controller firmware.
- `sensor-board`: sensor ESP32 firmware.

When a firmware release is ready:

1. Add the firmware binary under `/releases/firmware/<board-id>/<version>/<board-id>.bin`.
2. Calculate the binary size and SHA-256 digest.
3. Add a release object to that board's `releases` array.
4. Copy that same release object into the board's `latest` field.

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

Apps can compare a board's installed semantic version with `latest.version`. When an update is accepted, the app should send the board the resolved absolute firmware URL and expected SHA-256 so the ESP32 can download over HTTPS and verify the image.

## Desktop App

Desktop update checks should request `/updates/desktop/latest.json` with caching disabled, select the matching platform, and compare the installed semantic version with `latest.version`.

When a desktop release is ready:

1. Add the installer/archive under `/releases/desktop/<platform-id>/<version>/`.
2. Calculate the binary size and SHA-256 digest.
3. Add a release object to that platform's `releases` array.
4. Copy that same release object into the platform's `latest` field.

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
