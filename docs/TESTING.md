# Test suite

Run `npm test` to execute every `tests/*.mjs` file and the five performance gates.
The runner starts the local game server when needed, continues after individual
failures, exits with a failure code if any suite fails, and writes
`test-results/suite-summary-all.json`. Existing servers are reused.

Use `npm run test:list` to inspect the complete inventory. New test files are
automatically included in the simulation group. GitHub uses the same runner in
six independent groups; all groups run even when another fails. Each group
uploads its reports, including its suite summary.

Examples:

```sh
npm test -- --group=interface
npm test -- --group=simulation
npm test -- --group=audio
```

`GAME_URL` selects an already running game server. `--playwright=/absolute/path/to/index.mjs`
selects an external Playwright installation when local dependencies are unavailable.

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

## Network checks

The default network suite connects two real browser WebRTC data channels using
local SDP exchange and exercises production state synchronization and command
handlers. It does not require the availability of a public signaling server.

`npm run test:network-live` additionally exercises the PeerJS public signaling
path. This separate integration check requires external network access and an
available signaling service; it is not a gate for the offline suite.

`benchmark-fps.mjs` is an exploratory FPS profiler, rather than a pass/fail gate.
It remains available through `npm run benchmark:fps`.
