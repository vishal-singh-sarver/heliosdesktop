#!/usr/bin/env bash
#
# Point the `helios-desktop-backend` submodule at the GitHub account that owns this fork,
# then check it out (recursively). `.gitmodules` uses a RELATIVE url
# (../helios-desktop-backend.git) so GitHub clones already resolve to the right account on
# their own — this script is the safety net for clones whose `origin` is NOT the
# fork's GitHub account (e.g. the internal git server) or when you want to force
# a specific owner/protocol.
#
# Owner resolution order:
#   1) first CLI arg           e.g.  scripts/setup-submodules.sh myorg
#   2) $BACKEND_OWNER env var
#   3) auto-detect from the first github.com remote of this superproject
#   4) fallback default: PlantSimulationLab
#
# Protocol: SSH by default; set BACKEND_HTTPS=1 for an https URL (token-based CI).
#
# Usage:
#   scripts/setup-submodules.sh [owner]
#   BACKEND_OWNER=myorg scripts/setup-submodules.sh
#   BACKEND_HTTPS=1 scripts/setup-submodules.sh myorg
set -euo pipefail

# Run from the repo root (this script lives in <repo>/scripts/).
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

owner="${1:-${BACKEND_OWNER:-}}"

if [ -z "$owner" ]; then
  # Auto-detect: first remote URL containing github.com, extract the owner.
  gh_url="$(git remote -v | awk '/github\.com/ {print $2; exit}')"
  if [ -n "${gh_url:-}" ]; then
    # Handle both git@github.com:owner/repo.git and https://github.com/owner/repo.git
    owner="$(printf '%s\n' "$gh_url" | sed -E 's#.*github\.com[:/]+([^/]+)/.*#\1#')"
  fi
fi

owner="${owner:-PlantSimulationLab}"

if [ "${BACKEND_HTTPS:-0}" = "1" ]; then
  url="https://github.com/${owner}/helios-desktop-backend.git"
else
  url="git@github.com:${owner}/helios-desktop-backend.git"
fi

echo "==> helios-desktop-backend submodule owner: ${owner}"
echo "==> setting url: ${url}"

# sync copies .gitmodules -> .git/config; then override with the explicit URL so
# this works regardless of what the relative url would have resolved to.
git submodule sync -- helios-desktop-backend
git config submodule.helios-desktop-backend.url "$url"
git submodule update --init --recursive

echo "==> done. current submodule url:"
git config --get submodule.helios-desktop-backend.url
