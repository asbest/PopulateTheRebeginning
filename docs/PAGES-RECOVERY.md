# Recovering a blocked GitHub Pages deployment

The built-in Pages workflow can finish with a timeout while its backend
deployment still has an active status. Later builds then succeed but deployment
fails with `due to in progress deployment` and names the blocking commit SHA.
This is separate from the browser test workflow.

The **Recover blocked Pages deployment** workflow checks that specific old
deployment, cancels it if still active, waits for cancellation, and requests a
Pages build from the latest default-branch revision. It does not delete the site
or change its source, domain, repository settings, or integration permissions.

The workflow runs when its implementation changes on `main`. It also supports
**Actions → Recover blocked Pages deployment → Run workflow**. For a later
incident, enter the full SHA named in the Pages error. The current workflow
commit cannot be selected for cancellation. A completed or missing deployment
does not need cancellation. If cancellation does not finish, the workflow fails
before requesting another build.

Only the short-lived `GITHUB_TOKEN` with `pages: write` and `contents: read` is
used, inside this repository's Actions runner. No personal token or new secret
is required. The guard tests run with fake HTTP responses before the recovery
step; they can also be run locally:

```sh
node tests/pages-recovery.mjs
```

The recovery workflow requests a build; the built-in **pages build and
deployment** workflow reports the actual publication result. Check both runs.

API reference: [GitHub Pages REST endpoints](https://docs.github.com/en/rest/pages/pages).
