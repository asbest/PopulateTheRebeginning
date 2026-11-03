# Settlement resource preparation

The initial loading screen spends up to 1.2 seconds scheduling preparation of
building types already present in the level. Synchronous initial rendering and driver calls
can overrun this window. Startup keeps its small previews and does not request
unused role/model groups or HD textures before play.

After play begins, future building groups download sequentially. Existing KTX2
transcoding uses at most two workers; downloads and decoding are independent of
the frame preparation queue. At close zoom, building textures are requested up
to 130 world units ahead. Visible texture identities, UV transforms, authored
geometry, detail settings, shadows, physics and animations are preserved.

A shared queue performs one GPU preparation step per animation frame. It yields
when the preceding CPU frame exceeds 22 ms, adds backoff after expensive steps,
and defers cold shader/prototype work during combat. Texture commits explicitly
initialize the stable texture object in the game's renderer. Geometry and shader
variants are prepared in a 1-pixel offscreen target in the same context. Renderer
state is restored afterwards; there is no hidden second WebGL context. Nearest
buildings and terrain chunks are scanned first, with camera motion predicted
up to two seconds / 40 world units ahead. Distant loaded chunks are subsequently
prepared too because their vegetation can cast shadows into the view.

No synchronous GPU completion queries run in gameplay. Preparation cannot split
a driver shader compilation or an individual upload, so it reduces first-entry
stalls rather than guaranteeing a minimum FPS on every GPU. It also needs time
to run: teleporting straight into an unprepared area may still initialize resources.
Existing preview/procedural fallbacks remain available after failed downloads;
failed preparation leaves ordinary rendering in place. Disposed geometry cancels
queued work, and restored WebGL contexts invalidate preparation caches.

Verification:

- `node tests/resource-budget.mjs`: priorities, deduplication, busy/combat frame
  deferral, backoff, cancellation and recovery after a failed job.
- `node tools/benchmark-settlement-entry.mjs`: prepares a seven-building settlement
  with mixed factions plus loaded landscape, then measures its first real draw.
  Requires zero texture uploads, zero static-buffer uploads over 16 KiB, zero new
  shader programs and matching pixels on consecutive frozen frames. GL completion
  and pixel reads are used only by this benchmark. Timings are device-specific.
- `node tests/download-loading.mjs`: startup byte budgets, lazy groups, stable HD
  texture replacement and missing/stalled/offline asset fallbacks.

The settlement benchmark runs in the GitHub performance group. Queue and
preparation counters are exposed through the existing test-only game API.
