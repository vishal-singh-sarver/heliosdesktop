# CI/CD Workflow

GitHub Actions pipeline for Helios GUI. This document describes what each workflow does, when
it runs, and the build policy that governs the whole pipeline.

## Branch model

```
feature/* ─► develop ─► release ─► main ──(tag vX.Y.Z)──► production
                                    │
                          M2 = active milestone branch
```

- **develop** — integration branch. Fast checks only.
- **release** — staging/QA branch (may not exist until a release is cut).
- **main** — production branch; tagging `vX.Y.Z` here publishes a stable release.
- **M2** — current milestone branch; produces a GitHub "QA Release" for manual testing.

## Build policy

> **Heavy builds (installer/package + e2e) run only on pushes to `release`, `main`, and `M2`.**
> Pull requests and `develop` get fast gates (lint + unit tests) only — never a build.

This keeps expensive native + Electron packaging off PRs and off the high-traffic `develop`
branch. It is enforced two ways: by **workflow triggers** (`on:`) and by **per-job `if:`
guards** (`github.event_name != 'pull_request'`) on the heavy jobs.

## What runs when

| Event | lint | unit tests | integration / e2e | package / installer |
|-------|:----:|:----------:|:-----------------:|:-------------------:|
| Pull request | ✅¹ | ✅¹ | ❌ | ❌ |
| push `develop` | ✅ | ✅ | ❌ | ❌ |
| push `release` | ✅ | ✅ | ✅ | ✅ |
| push `main` (or manual dispatch) | ✅ | ✅ | ✅ | ✅ |
| push `M2` | — | — | — | ✅ (QA Release) |
| tag `vX.Y.Z` on `main` | — | — | — | promote → stable release |

¹ For `main`, lint/unit run on PRs whose head branch is `release` or `hotfix/*` (the only
branches that PR into `main`). For `develop` and `release`, lint/unit run on all PRs.

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `ci-develop.yml` | PR + push `develop` | Lint + unit tests (the build/"Build Check" job is commented out — no builds on develop/PRs). |
| `ci-release.yml` | PR + push `release` | Lint + unit on PR/push; integration + package only on push (PR-gated out). |
| `ci-main.yml` | PR + push `main`, manual | Lint + unit; integration + package only on push/dispatch. Produces `stable-installer-*` artifacts for `publish-stable`. |
| `build-installers.yml` | push `M2`, manual | Builds Win/macOS/Linux installers and publishes the rolling **GitHub "QA Release"** (tag `QA-Release`). |
| `publish-stable.yml` | tag `v*.*.*` | Verifies the tag is on `main` + a green `ci-main` run exists, promotes those artifacts, creates the public GitHub Release `Helios vX.Y.Z`. |
| `publish-beta.yml` | manual | Beta channel publish (currently a placeholder until S3 + Slack secrets are wired). |
| `backmerge-main.yml` | PR closed → `main` | Opens automatic back-merge PRs `main → release` and `main → develop`. No build. |
| `emergency-single-platform.yml` | manual | Audited single-platform republish to a chosen feed channel. |

## Heavy-job gating (how PRs are kept build-free)

`ci-main.yml` and `ci-release.yml` carry the full pipeline (lint, unit, integration, package).
The build-dependent jobs are gated so they skip pull requests:

```yaml
  test-integration:
    if: github.event_name != 'pull_request'   # builds the app + runs e2e
  package:
    if: github.event_name != 'pull_request'   # installer/package build
```

`package` still declares `needs: [lint, test-unit, test-integration]`; on a PR it is skipped by
its own `if:`, and on a push all needed jobs run, so the dependency stays valid.

## QA Release versioning (`build-installers.yml`)

The release job reads the app version from `package.json` and names the release dynamically:

```yaml
- name: Read version from package.json
  id: version
  run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"
# ...
  name: "Helios QA Release v${{ steps.version.outputs.version }}"
```

The tag stays `QA-Release` (a rolling pre-release the job deletes/recreates each run); only the
display name + notes carry the version.

## Conventions & secrets

- **Submodules:** every build checks out with `submodules: recursive` and `token: ${{ secrets.PAT }}`.
  The `backend-api` submodule uses a relative URL so CI auto-follows the repo's account — see
  [git-submodule-setup.md](git-submodule-setup.md).
- **`.env`:** each job writes `VITE_BACKEND_URL=http://localhost:8000` before building.

### Secrets used by the workflows

| Secret | Required? | Used by | Purpose |
|--------|-----------|---------|---------|
| `PAT` | **Yes** | ci-develop, ci-main, ci-release, build-installers, backmerge-main | Checkout token that clones the **private `backend-api` submodule** (and its nested `pyhelios`). Without it, every build fails at checkout. |
| `GITHUB_TOKEN` | Auto | publish-stable, build-installers, backmerge-main | Built-in token GitHub injects automatically — **nothing to create**. Creates GitHub Releases and deletes the rolling `QA-Release`. |
| `BACKMERGE_PAT` | Only for backmerge | backmerge-main | Lets the auto back-merge job open PRs whose checks actually run (PRs opened with `GITHUB_TOKEN` don't trigger further workflows). |
| `UPDATE_FEED_S3_ACCESS_KEY` / `UPDATE_FEED_S3_SECRET_KEY` | Optional | publish-*, emergency | S3 credentials for the update feed (publish steps are placeholders until set). |
| `UPDATE_FEED_BUCKET_BETA` / `_STAGING` / `_STABLE` | Optional | publish-*, ci-main | Target buckets for the beta/staging/stable feeds. |
| `SLACK_WEBHOOK_RELEASES` | Optional | publish-* | Slack release notifications. |
| `WIN_CERT_BASE64` / `WIN_CERT_PASSWORD`, `APPLE_CERT_BASE64` / `APPLE_CERT_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | Optional | ci-main, ci-release | Code-signing / notarization (currently commented out in the workflows). |

### The `PAT` secret (required)

`PAT` is a **Personal Access Token** for a GitHub account that can read the `backend-api`
repository. It is the one secret the pipeline cannot run without. The workflows check this repo
out with `submodules: recursive`, and the built-in `GITHUB_TOKEN` is scoped to **only this
repo** — it cannot clone a submodule that lives in a *different* (private) repository. `PAT`
supplies that cross-repo read access; if it is missing or lacks access, every job fails at the
"Checkout code" step.

**Create it:**

1. On GitHub: **Settings → Developer settings → Personal access tokens**.
2. Either kind works:
   - **Fine-grained token** (recommended): under **Repository access**, select both `helios_gui`
     and `backend-api`, and grant **Contents: Read-only** (use Read/Write if the same token also
     backs `BACKMERGE_PAT`, which additionally needs **Pull requests: Read/Write**). Set an
     expiry and calendar a renewal.
   - **Classic token**: enable the **`repo`** scope.
3. Copy the token value (GitHub shows it once).

**Add it to the repo:** **Settings → Secrets and variables → Actions → New repository secret**,
name it exactly **`PAT`**, paste the value, and save.

> The token belongs to a *user account*, so that account must have access to `backend-api`. On a
> fork, generate `PAT` from an account that can read *your* fork of `backend-api`.

## Manual triggers

- **Build a QA Release on demand:** Actions → *Build Installers* → *Run workflow*.
- **Full main pipeline on demand:** Actions → *CI / main* → *Run workflow* (dispatch counts as
  non-PR, so integration + package run).

## Setting up the pipeline in a new repository (or fork)

To bring the pipeline up in a fresh repo (e.g. after forking to a new account):

1. **Fork/create both repos under the same account.** Fork `backend-api` alongside `helios_gui`,
   keeping the name `backend-api`. The submodule URL is relative, so CI resolves it to your
   account automatically ([git-submodule-setup.md](git-submodule-setup.md)) — no `.gitmodules`
   edit needed.
2. **Create the `PAT` secret** (see [The `PAT` secret](#the-pat-secret-required) above) from an
   account that can read your `backend-api`. This is mandatory — nothing builds without it.
3. **(Optional) add the other secrets** you plan to use: `BACKMERGE_PAT` (a PAT with
   **Pull requests: Read/Write**) for the auto back-merge PRs; `UPDATE_FEED_*` /
   `SLACK_WEBHOOK_RELEASES` for the publish/feed jobs; the signing secrets for notarized
   installers.
4. **Enable Actions on the fork.** Open the **Actions** tab and confirm workflows are enabled
   (GitHub disables them on new forks by default). If you use backmerge, also allow Actions to
   create PRs: **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to
   create and approve pull requests."**
5. **Create the long-lived branches the workflows target:** `main`, `M2`, and (when you cut a
   release) `release`. Builds run on pushes to these — see the [build policy](#build-policy).
6. **Trigger a run.** Push to `M2` (→ QA Release) or `main` (→ full pipeline +
   `stable-installer-*` artifacts), or use **Actions → Run workflow** for a manual dispatch. Open
   a PR to confirm the lint + unit-test gates fire *without* building.
7. **(Release) tag on `main`.** Pushing a `vX.Y.Z` tag runs `publish-stable`, which requires a
   green `ci-main` run for that commit before it creates the GitHub Release.
