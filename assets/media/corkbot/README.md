# Cork V1 website films

Sources supplied by the owner, kept unchanged:

- `drawBot/drawBotBlender/cinematic/v002_mobile/deliverables/corkbot_mobile_review_4k.mp4`
- `corkbot-cad-agent/concepts/G1_4axis_gripper/anim/blender/G1_corkbot_operating.mp4`

Paths are relative to the common `Documents/GitHub` directory.

| Website file | Treatment | Load behavior |
| --- | --- | --- |
| mobile-preview.mp4 | First 17.8 s, 1600×900, H.264 CRF 24 | Muted/inline when visible and preferences allow |
| mobile-film-hd.mp4 | Complete 20 s, 1920×1080, H.264 CRF 21 | Explicit film action |
| mobile-film-4k.mp4 | Unchanged supplied 3840×2160 MP4 | Explicit original-film link |
| gripper-4axis-film-hd.mp4 | Source 6–15 s, 1920×1080, 30 fps, H.264 CRF 18 | Gallery loop when visible; homepage film action |
| gripper-4axis-poster.webp | Source frame at 14.966667 s, width 1920, quality 88 | Poster before playback |
| mobile-poster.webp | Frame at 2.2 s, width 1920, quality 87 | Preloaded hero poster |

Derived mobile videos use FFmpeg `libx264`, `-preset medium`, `-pix_fmt yuv420p`,
`-an`, and `-movflags +faststart`, at the original 24 fps. Full frames are
retained; source simulation disclosure stays in the picture. The ambient
preview ends before the closing title card. No generative images, interpolation,
upscaling, or new renders were used. The mobile 4K file matches the original by SHA-256.

The four-axis gripper clip replaces the retired three-axis gripper film. It
contains exactly 270 source frames (180–449), encoded with libx264 slow,
yuv420p, no audio and faststart. Source video remains unchanged. No crops,
interpolation or upscaling. See docs/gripper-four-axis-20261101.json for provenance.
