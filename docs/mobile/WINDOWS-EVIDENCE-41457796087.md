# Windows evidence — Actions run 41457796087

**Status:** NOT PRESERVED in this sandbox. This note is a retrieval record, not an archive.

| Field | Value |
| --- | --- |
| Run | [41457796087](https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087) |
| Head SHA | `e13a930549d45b141d85ee8f7c8deeef470d7396` |
| Head branch | `arena/d8cb03c5-sornio` |
| Conclusion | success |
| `Sornio-Local-Workspace-Review` | 222744930 bytes, artifact id 13149371946, expires 2026-11-09T14:28:06Z |
| GitHub-reported zip digest | `sha256:2b6bfaf5d60c2438b22e6596367ad37ab5253923b7a76c4c08d6b85e5e399449` |
| `Sornio-Local-Native-Captures` | 1278398 bytes, artifact id 13149486747, expires 2026-11-09T14:28:14Z |
| GitHub-reported zip digest | `sha256:1c70021fd649c37dbbe14b274d759b575435d6016c8c25f05ae0608d6ca89e38` |
| Expired? | false as of 2026-11-03 |

## Retrieval attempt

`gh api repos/uddieee33-blip/Sornio/actions/artifacts/13149371946/zip` redirected to `productionresultssa32.blob.core.windows.net`. This sandbox cannot open that host. The downloaded file was 0 bytes, so this workspace still has no independent SHA-256 of the zip bytes. The digests above are GitHub's `digest` field on the artifact objects, not a hash computed from archived copies here.

## Required authorized action

Before **2026-11-09T14:28:06Z**, download both artifacts from the Actions UI on a host that can follow the Azure blob redirect, hash them, and store them outside Actions retention. Do not commit the NSIS installer or captures into git.
