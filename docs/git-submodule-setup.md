# Git Submodule Setup

How the `backend-api` submodule is wired so it **follows the GitHub account automatically** on a
fork — no `.gitmodules` edit required when you fork the project to a different account.

## Submodules in this repo

| Submodule | Path | URL in `.gitmodules` | Notes |
|-----------|------|----------------------|-------|
| Backend API | `backend-api/` | `../backend-api.git` (relative) | The FastAPI backend. Forked alongside the frontend into the same account. |
| PyHelios | `backend-api/pyhelios/` | `https://github.com/PlantSimulationLab/PyHelios.git` (absolute) | Third-party upstream; **not** account-specific. Lives in the backend's own `.gitmodules` — left absolute, do not change. |

## Why the URL is relative

`.gitmodules` uses a **relative** URL for `backend-api`:

```ini
[submodule "backend-api"]
	path = backend-api
	url = ../backend-api.git
```

Git resolves `../backend-api.git` against the superproject's remote, replacing only the repo
name and keeping the **account/org**:

- `github.com/<account>/helios_gui` → `github.com/<account>/backend-api.git`
- A fork under `userB` → `userB/backend-api.git`, automatically.
- It inherits the **protocol** too — SSH locally, HTTPS+token in CI.

**Result:** forking to a new account needs **zero** edits to `.gitmodules`, as long as you clone
from that account's GitHub repo (and have forked `backend-api` into the same account with the
same name).

## Cloning

```bash
# Clone with submodules in one step
git clone --recurse-submodules <helios_gui-url>

# …or, if you already cloned:
git submodule update --init --recursive
```

When the superproject's `origin` is a **GitHub** URL, the relative URL resolves correctly and
nothing else is needed.

## When the relative URL is NOT enough

The relative URL resolves against whatever `origin` points to. If you clone from a remote that
is **not** the fork's GitHub account — e.g. the internal git server (`192.168.3.185`), which
does not host `backend-api` — `../backend-api.git` would resolve to the wrong place. Use the
setup helper, which **forces the correct GitHub URL** regardless of clone source:

```bash
npm run setup:submodules
# or directly:
bash scripts/setup-submodules.sh
```

### Owner resolution order (`scripts/setup-submodules.sh`)

1. First CLI argument — `bash scripts/setup-submodules.sh myorg`
2. `$BACKEND_OWNER` env var — `BACKEND_OWNER=myorg npm run setup:submodules`
3. Auto-detected from the first `github.com` remote of the superproject
4. Fallback default: `PlantSimulationLab`

Protocol is SSH by default; set `BACKEND_HTTPS=1` for an HTTPS URL (useful for token-based CI):

```bash
BACKEND_HTTPS=1 bash scripts/setup-submodules.sh myorg
```

What it does:

```bash
git submodule sync -- backend-api
git config submodule.backend-api.url "git@github.com:<owner>/backend-api.git"
git submodule update --init --recursive
```

### Windows

`scripts/setup-windows-dev.ps1` (Phase 0) performs the same owner resolution and URL fix before
checking out submodules, so Windows internal-server clones also land on the correct account. You
can override with `$env:BACKEND_OWNER` before running it.

## Forking checklist

1. Fork **both** `helios_gui` and `backend-api` into your account (keep the name `backend-api`).
2. Clone your `helios_gui` fork from GitHub with `--recurse-submodules`.
3. If you cloned from a non-GitHub origin (or the submodule points at the wrong account), run
   `npm run setup:submodules` (optionally passing your account name).
4. `.gitmodules` itself never needs editing.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `backend-api` empty after clone | `git submodule update --init --recursive` (or `npm run setup:submodules`). |
| Submodule fetch points at the wrong account | `npm run setup:submodules <your-account>` to force the URL. |
| Cloned from the internal server, submodule fails | `npm run setup:submodules` — it forces the GitHub URL. |
| Want to verify the resolved URL | `git config --get submodule.backend-api.url` |
| Changed `.gitmodules` and need to re-apply | `git submodule sync` then `git submodule update --init --recursive`. |

> Note: `git submodule sync` copies `.gitmodules` into `.git/config`, resolving the relative URL
> against your **current** `origin`. If your `origin` is the internal server, prefer
> `npm run setup:submodules`, which overrides with the explicit GitHub URL after syncing.

## CI

GitHub Actions checks out with `submodules: recursive` + `token: ${{ secrets.PAT }}`. Because
the URL is relative, each workflow resolves `backend-api` against the repository it is running
in — so a fork's CI uses the fork's own backend with the fork owner's `PAT`. No CI change is
needed when forking. See [ci-cd-workflow.md](ci-cd-workflow.md).
