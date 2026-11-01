# Global page-load statistics

The cheat menu displays global page loads, not unique people. The replacement
series starts on 1 November 2026; totals from the retired CounterAPI v1 service
cannot be recovered through its removed API.

The original client in `art/visit-statistics.js` calls the free public service
documented at https://countapi.mileshilliard.com/. No provider SDK, script,
package or third-party source is bundled. Requests use HTTPS, omit credentials
and referrers, and carry only a counter key. No player identifiers or game/save
data are submitted.

Production prefix: `ptr-asbest-1123789879-global-20261101`.
The four keys end in `-total`, `-year-YYYY`, `-month-YYYY-MM` and
`-week-YYYY-WW` (ISO week-year). All periods use UTC for consistent totals across
players. The `/hit/KEY` endpoint creates a missing key and increments it once;
`/get/KEY` reads it. Missing read-only keys represent zero visits in that period.

Only the published game at `asbest.github.io/PopulateTheRebeginning/` records
loads. Local, file, other-host and `?test` launches do not count. The cheat-menu
Refresh button always reads without incrementing. Concurrent refreshes share
one request group, startup never waits for the service, and requests time out
after six seconds. Failed increments are never retried automatically: the
server might have counted them even when its response was lost.

Last successful values are cached per counter/period. A blocked or offline
service shows an explicit error and preserves cached values; it never silently
substitutes local launches for global counts. Refresh can retry reads without
inflating the totals. The public service is suitable for approximate page-load
statistics; keys and values are public and have no authenticated ownership.

The provider and prefix are centralized at the top of the client module so a
future replacement does not require changes to the menu or game simulation.
