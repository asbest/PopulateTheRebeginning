# Test suite

Run `npm test` to execute every `tests/*.mjs` file and the five performance gates.
The runner starts the local game server when needed, continues after individual
failures, exits with a failure code if any suite fails, and writes
`test-results/suite-summary-all.json`. Existing servers are reused.

Use `npm run test:list` to inspect the complete inventory. New test files are
automatically included in the simulation group. GitHub uses the same runner in
six independent groups; all groups run even when another fails. Each group
uploads its reports, including its suite summary.

`licenses.mjs` tests the separate license guard with isolated Git fixtures:
unlicensed/non-commercial dependencies, optional packages, changed/new vendor
files and media, notice tampering, unresolved media, attribution evidence and
lockfile drift. The **License compliance** workflow checks the real inventory;
it fails whenever tracked media lacks provenance or required license evidence.

`download-loading` checks real desktop/mobile startup requests and byte budgets,
exact model-chunk contents, deferred attachments and faction changes, progressive
HD textures, failed/stalled downloads, versioned offline asset reuse and rejected
service-worker registration. Full-quality art tests explicitly use `assets=full`;
normal gameplay/startup tests exercise progressive loading. Service workers are
disabled under `test=1` unless `cache=1` is also supplied, preserving network-fault
fixtures. Regenerate asset hashes with `npm run build:asset-manifest` after runtime
edits, or `npm run build:startup` after changing source textures/model exports.

Examples:

```sh
npm test -- --group=interface
npm test -- --group=simulation
npm test -- --group=audio
```

`GAME_URL` selects an already running game server. `--playwright=/absolute/path/to/index.mjs`
selects an external Playwright installation when local dependencies are unavailable.

The startup suite also checks blocked local storage and exhausted storage quotas,
including session-only save/load and its visible persistence notice. To run these
checks in a separately installed Brave browser:

```sh
node tests/startup.mjs --browser=/absolute/path/to/brave
```

## Coverage reviewed on 2026-10-25

| Group | Suites and current behavior |
| --- | --- |
| Interface | `startup`, `peace-time`, `campaign-story`, `campaign-levels`, `live-gameplay`, `browser`: welcome screen, desktop/touch controls, explicit unit selection, configurable 2.5-minute peace default, campaign journal, progression, saves and live play. |
| Simulation | `ai-stutter`, `building-durability`, `building-navigation`, `combat-system`, `faith-worship`, `locomotion`, `network`, `pathfinder-worker`, `spells`, `strategy`, `totem-aura`, `tree-navigation`: scheduling, building strength and spacing, demolition through a selected builder, hidden actions without a selected unit, manual combat, worship, flight/landing/recovery, terrain collision, worker fallback, spell preparation, AI, healing/mana and tree obstacles. |
| Rendering | `blender-assets`, `ktx2`, `environment`, `terrain-variety`, `trees`, `sfx-assets`, `materials`: assets, compressed textures and fallback, water/scenery, terrain, connected vegetation, burning/regrowth and audio files. |
| Audio | `music`, `audio`: music rotation, real pointer/touch unlock, desktop/mobile playback, sustained sounds, pause/expiry and Web Audio fallback. The desktop world is closed before loading the mobile world to release its WebGL resources. |
| Long strategy | `strategy-long`: extended enemy economy, attack/defense and recovery; converted attackers also count as repelled. |
| Performance | `benchmark-first-fireball`, `benchmark-group-impact`, `benchmark-firewarriors`, `benchmark-hut-destruction`, `benchmark-firestorm`: first-use shaders and bounded rendering work during attacks/destruction. |

Fixtures that inspect action buttons must explicitly select the relevant unit.
Closing welcome/story overlays resumes the game, so deterministic fixtures must
pause **after** closing them. Paused simulations must explicitly update spatial
lookups or spell preparation when the assertion depends on them. Gameplay and
rendering budget assertions remain active; missing UI is never treated as a
successful disabled-button check.

Entering first person as a warrior equips the club. A primary view click starts
a swing instead of a movement/chase command, including while walking. The combat
suite checks entry through the real zoom gesture, the visible weapon at contact,
damage, peace-time blocking and ignored pointer releases without a canvas gesture.

The firestorm gate disables peace time, completes spell preparation and directs
impacts at a loaded tree. It checks the current batched effects and rejects shader
compilation during impacts. Burned-tree materials retain the original wind shader
and its cache key; `trees.mjs` checks this alongside burning and regrowth.

## Network checks

The default network suite connects two real browser WebRTC data channels using
local SDP exchange and exercises production state synchronization and command
handlers. It does not require the availability of a public signaling server.
Both pages complete normal startup at low graphics quality in a small viewport.
After that first frame, idle redraws and world streaming are stopped in this test
so the host does not compete with the client's startup on software-rendered CI.
Assertions poll on timers, independently of animation frames. Game state,
WebRTC, command processing and the synchronized shield mesh remain checked.
Startup timing is recorded for each page; failures include the last checkpoint,
loading state, texture progress and browser errors.

`npm run test:network-live` additionally exercises the PeerJS public signaling
path. This separate integration check requires external network access and an
available signaling service; it is not a gate for the offline suite.

`benchmark-fps.mjs` is an exploratory FPS profiler, rather than a pass/fail gate.
It remains available through `npm run benchmark:fps`.
