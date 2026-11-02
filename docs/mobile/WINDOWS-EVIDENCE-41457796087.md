# Windows evidence — Actions run 41457796087

**Status:** NOT PRESERVED in this sandbox. This note is a retrieval record, not an archive.

| Field | Value |
| --- | --- |
| Run | [41457796087](https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087) |
| Head SHA | `e13a930549d45b141d85ee8f7c8deeef470d7396` |
| Head branch | `arena/d8cb03c5-sornio` |
| Conclusion | success |
| `Sornio-Local-Workspace-Review` | 222744930 bytes, artifact id 13149371946, expires 2026-11-09T14:28:06Z |
| `Sornio-Local-Native-Captures` | 1278398 bytes, artifact id 13149486747, expires 2026-11-09T14:28:14Z |
| Expired? | false as of 2026-11-03 |

## Retrieval attempt

`gh api repos/uddieee33-blip/Sornio/actions/artifacts/13149371946/zip` redirected to `productionresultssa32.blob.core.windows.net`. This sandbox cannot open that host. The downloaded file was 0 bytes, so no SHA-256 of the installer or captures exists here.

## Required authorized action

Before **2026-11-09T14:28:06Z**, download both artifacts from the Actions UI on a host that can follow the Azure blob redirect, hash them, and store them outside Actions retention. Do not commit the NSIS installer or captures into git.
