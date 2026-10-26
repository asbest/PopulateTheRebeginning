# License audit — 2026-10-26

**Status: the dependency and complete inventory checks pass with the recorded
project-owner provenance for seven AI-generated uploads. This does not license
the whole repository to others or independently verify generation-service terms.**

## Software

The 11 reviewed runtime components/snapshots use MIT, Apache-2.0 or BSD-3-Clause.
The 33 direct, transitive and optional platform packages in `package-lock.json`
declare MIT, Apache-2.0, ISC, 0BSD and LGPL-3.0-or-later (including AND combinations).
No non-commercial, evaluation-only or proprietary package license was found in
these declarations. Exact versions, registry integrity values and vendor file
hashes are recorded. The CI now uses `npm ci` instead of resolving fresh versions.

| Runtime component | Version/snapshot | License notice |
| --- | --- | --- |
| Three.js and modified local-import loaders | 0.128.0 | `vendor/THREE-LICENSE.txt`, MIT |
| KTX-Parse | 0.2.1 | `vendor/KTX-PARSE-LICENSE.txt`, MIT |
| Zstandard JS/WASM decoder | bundled by Three.js 0.128.0 | `vendor/ZSTD-LICENSE.txt` and Three.js notice, MIT/BSD-3-Clause |
| Basis Universal JS/WASM transcoder | bundled by Three.js 0.128.0 | `vendor/BASIS-LICENSE.txt`, Apache-2.0 |
| simplex-noise | 2.4.0 | `vendor/SIMPLEX-LICENSE.txt`, MIT |
| PeerJS | 1.5.2 | `vendor/PEERJS-LICENSE.txt`, MIT |
| peerjs-js-binarypack in PeerJS | 2.1.0 | `vendor/PEERJS-JS-BINARYPACK-LICENSE.txt`, MIT |
| webrtc-adapter in PeerJS | 8.2.3 | `vendor/WEBRTC-ADAPTER-LICENSE.txt`, BSD-3-Clause |
| sdp in PeerJS | 3.2.0 | `vendor/SDP-LICENSE.txt`, MIT |
| eventemitter3 in PeerJS | 4.0.7 | `vendor/EVENTEMITTER3-LICENSE.txt`, MIT |
| Rapier compatibility module with embedded WASM | 0.11.2 | `vendor/RAPIER-LICENSE.txt`, Apache-2.0 |

PeerJS's four embedded dependency versions were identified using its published
[source map](https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js.map). The corresponding
source files match the published npm packages after newline normalization: 3/3,
11/11, 1/1 and 1/1 source files, respectively. Previously missing notices have been
added; vendor downloads now preserve them on regeneration.

Build tools: `ktx2-encoder@0.5.4` is MIT (its Basis encoder is Apache-2.0),
`playwright@1.62.1` is Apache-2.0, and `sharp@0.34.4` is Apache-2.0. Sharp's optional
native/libvips distributions also carry LGPL-3.0-or-later obligations, as recorded
in the lockfile. They are build tools, not scripts/binaries served to players.
If redistributing these tools, preserve their complete upstream notices and any
applicable corresponding-source/relinking rights; converting an image does not
turn the image into an LGPL program.

This is a review of versioned upstream license declarations, bundled notices and
documented provenance, not an independent reconstruction of every contributor's
rights or a patent/trademark clearance.

## Media

The inventory covers 262 tracked media/model files. Repository documentation
attributes the newer artwork/textures to project generation, the Blender models
and material maps to `tools/blender_overhaul.py`, gameplay images to project
captures, and 32 WAV effects to the local synthesizer `tools/generate-sfx.mjs`.
KTX2 files and startup previews/model groups are derivatives of those sources.
This documented authorship is recorded as `project-original`, with no invented
third-party license or automatic public license grant. Input/reference rights
and applicable generation-service terms still matter for generated derivatives.

### Media owner attestation

On 2026-10-26, the project owner stated in this project conversation: "Die von dir
genannten Dateien wurden durch KI generiert daher bin ich selber der Herausgeber".
This attestation applies to the seven files whose provenance was requested:

- `FightMusic.mp3`
- `IngameMusic.mp3`
- `IngameMusic2.mp3`
- `TitleImage.png`
- `TitleImage2.png`
- `Unittextures.png`
- `promovideo1.mp4`

The three MP3s are used by the game; the remaining files are also tracked in the
inventory. These seven records are now `project-original` based on the owner's
attestation, with `license: null`. The attestation identifies AI generation and
the owner's role as publisher; it does not identify the generator or its terms,
independently establish rights in any inputs, or grant a public license. Review
those terms and any third-party inputs before a release that depends on them.

## Project license and external environment

There was no root project license at the time of review. The owner's request to
check third-party licensing is not treated as permission to grant the entire game
to others under MIT. A project-wide license remains a separate owner decision.
Public GitHub visibility alone is not a copyright license.

No font files are bundled: Segoe UI/system-ui are locally available system-font
references. No Google Chrome executable is distributed in this repository; it is
an optional local test browser. CI uses Playwright's open-source Chromium.
Blender/NumPy and Node.js are external authoring/development tools, not embedded
game libraries. Their licenses are distinct from ownership/licensing of outputs.
PeerJS signaling, donation links and visitor-counter APIs are external services;
an open-source client library does not make a hosted service open source.

## Enforcement

`npm run license:check` produces `test-results/license-audit.json` and fails on
unknown licenses, changed/unreviewed vendor files/media, missing notices, lockfile
drift, or unresolved media provenance. `npm run license:dependencies` reports the
software dependency portion separately and must not be reported as a full
inventory check.

The dedicated GitHub **License compliance** workflow runs the full check. The
seven records now have the owner's provenance attestation. Existing browser/game
tests remain separate. Branch-based GitHub Pages deployment is independent of
this workflow; the audit does not block hosting by itself.

Before distributing a release, check the applicable generation-service terms and
any third-party inputs, and require the license check in the repository's
release/merge process. Do not bypass the check or delete unresolved entries just
to get a green badge.

Primary references: [Open Source Definition](https://opensource.org/osd),
[Three.js license](https://unpkg.com/three@0.128.0/LICENSE),
[Rapier license](https://unpkg.com/@dimforge/rapier3d-compat@0.11.2/LICENSE),
[KTX-Parse license](https://unpkg.com/ktx-parse@0.2.1/LICENSE),
[Playwright license](https://raw.githubusercontent.com/microsoft/playwright/v1.62.1/LICENSE),
[Sharp license](https://raw.githubusercontent.com/lovell/sharp/v0.34.4/LICENSE),
[libvips](https://www.libvips.org/).
