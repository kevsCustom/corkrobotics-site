# CorkBot website films

Sources supplied by the owner, kept unchanged:

- `drawBot/drawBotBlender/cinematic/v002_mobile/deliverables/corkbot_mobile_review_4k.mp4`
- `drawBot/drawBotBlender/cinematic/v001/deliverables/corkbot_opening_retimed_4k.mp4`

Paths are relative to the common `Documents/GitHub` directory.

| Website file | Treatment | Load behavior |
| --- | --- | --- |
| mobile-preview.mp4 | First 17.8 s, 1600×900, H.264 CRF 24 | Muted/inline when visible and preferences allow |
| mobile-film-hd.mp4 | Complete 20 s, 1920×1080, H.264 CRF 21 | Explicit film action |
| gripper-film-hd.mp4 | Complete 10 s, 1920×1080, H.264 CRF 21 | Explicit film action |
| mobile-film-4k.mp4 | Unchanged supplied 3840×2160 MP4 | Explicit original-film link |
| gripper-film-4k.mp4 | Unchanged supplied 3840×2160 MP4 | Explicit original-film link |
| mobile-poster.webp | Frame at 2.2 s, width 1920, quality 87 | Preloaded hero poster |
| gripper-poster.webp | Frame at 7.5 s, width 1600, quality 88 | Lazy-loaded section poster |

Derived videos use FFmpeg `libx264`, `-preset medium`, `-pix_fmt yuv420p`,
`-an`, and `-movflags +faststart`, at the original 24 fps. Full frames are
retained; source simulation disclosure stays in the picture. The ambient
preview ends before the closing title card. No generative images, interpolation,
upscaling, or new renders were used. Both 4K files match the originals by SHA-256.
