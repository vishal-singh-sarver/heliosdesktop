# Your first change

A guided first contribution: make something small work end to end, so the next change is about the
problem rather than about the tooling.

Budget an hour, plus the one-off setup.

## Before you start

- [Getting started](getting-started.md) done, and `npm run dev` opens the app.
- Skim [Repo map](repo-map.md) — mainly the four look-alike folders.
- You do **not** need to have read the architecture pages yet.

---

## 1. Prove the loop works

Before changing anything, confirm you can see a change.

```bash
npm run dev
```

Edit any string in `src/renderer/src/containers/HomePage/messages.ts`, save, and watch the window
update. Put it back.

If that works, your frontend loop is sound. **Do not start on a real task until it does.**

## 2. Pick something small

Good first changes touch one layer and have a visible result:

| Kind | Example |
|---|---|
| A label or message | Anything in a container's `messages.ts` |
| A validation bound | A range in a migration seed — see [Add a property](recipes/add-property.md) |
| A troubleshooting entry | A symptom you just hit, added to these docs |
| A test | Cover an untested branch in a saga or reducer |

Avoid, for a first change: anything in `src/main/`, the material sync engine, or
`scene_object_service.py`. Those are the three places where a small edit can have a
non-obvious blast radius.

!!! tip "Choosing between frontend and backend"
    Frontend-only changes have the fastest loop — hot reload, seconds. A backend change needs a
    rebuild and re-sync before `npm run dev` picks it up:

    ```bash
    cd helios-desktop-backend && source venv/bin/activate
    bash scripts/build_binary.sh
    cd .. && npm run sync-backend
    ```

    Start on the frontend.

## 3. Branch

```bash
git checkout develop
git pull
git checkout -b fix/short-description
```

`develop` is the main branch for this repo.

!!! danger "Backend changes live in a different repository"
    `helios-desktop-backend/` is a submodule. If your change touches it, you need a branch and a
    commit **inside** that folder, and a second commit here updating the submodule pointer. See
    [Backend submodule](../git-submodule-setup.md).

    If this is your first change, prefer one that stays in this repo.

## 4. Make the change

Follow the surrounding code. The conventions in [Dev loop](dev-loop.md) are not stylistic — a few
that catch people first:

- No `console.log` in committed code.
- Components read state only through memoized selectors.
- Never `useEffect` to trigger a saga on mount — dispatch the action.
- No `any` without a one-line justification; no non-null `!`.

## 5. Test it

```bash
npm test
npm run lint
```

Then look at it in the running app. Both matter — the suites do not cover rendering.

If you touched a saga or a reducer, add or update its test. They live next to the code
(`foo.ts` → `foo.test.ts`), never in a parallel `__tests__` tree.

Not needed for a first change: the e2e suite. It requires a full build and takes minutes.

## 6. Open the merge request

```bash
git add -p          # review every hunk
git commit -m "Short imperative summary"
git push -u origin fix/short-description
```

In the description, say **what changed and why**. If the reason is not obvious from the diff, that
sentence is the most valuable part of the request.

For anything non-trivial, write the task up *before* starting: a one-sentence goal, **testable**
acceptance criteria, affected files, constraints.

!!! warning "Never force-push a shared branch, or amend a published commit"
    Both are in the project's explicit "never" list.

---

## When you get stuck

| Symptom | Look at |
|---|---|
| Any npm script fails immediately | `.env` missing — `cp .env.example .env` |
| Backend won't start | [Troubleshooting](troubleshooting.md), then `backend.log` |
| Project list is empty after a crash | An orphaned backend — see [Troubleshooting](troubleshooting.md) |
| "Where is this handled?" | [Repo map](repo-map.md), then grep. The codebase comments *why*, generously |
| "How do I add a …?" | [Recipes](recipes/index.md) — six common tasks, step by step |

!!! tip "The comments are the documentation"
    This codebase explains its decisions in unusual detail, usually with measurements. Before
    changing something that looks odd, read the comment above it — there is very often a recorded
    reason, and these docs are largely those comments reorganised by audience.

## Next

Once your first change is merged:

1. [Process model & IPC](arch/processes.md) — the mental model. Read once, used constantly.
2. [The property system](arch/properties.md) — why so much of this app is data rather than code.
3. [Recipes](recipes/index.md) — skim the six so you know what exists.
