// ── Boot lifecycle ───────────────────────────────────────────────────────────
//
// One saga owns opening a project. Every other container reacts to the actions
// it dispatches — nothing else starts a load, so the order is fixed rather than
// emergent from whichever component mounted first.

export const OPEN_PROJECT = 'app/ProjectBoot/OPEN_PROJECT' as const
export const BOOT_STARTED = 'app/ProjectBoot/BOOT_STARTED' as const
export const BOOT_PROGRESS = 'app/ProjectBoot/BOOT_PROGRESS' as const
export const BOOT_SUCCEEDED = 'app/ProjectBoot/BOOT_SUCCEEDED' as const
export const BOOT_FAILED = 'app/ProjectBoot/BOOT_FAILED' as const
export const RETRY_BOOT = 'app/ProjectBoot/RETRY_BOOT' as const

// User pressed Cancel (or the × on the loader). CANCEL_BOOT is the request;
// BOOT_CANCELLED is dispatched once the run has actually unwound.
export const CANCEL_BOOT = 'app/ProjectBoot/CANCEL_BOOT' as const
export const BOOT_CANCELLED = 'app/ProjectBoot/BOOT_CANCELLED' as const

// Closing the error dialog. Deliberately not CANCEL_BOOT: that one is taken by
// the race inside a live run, and a failure is only ever dispatched once the
// run has ended — so the buttons on the error dialog had nothing listening.
export const DISMISS_BOOT_ERROR = 'app/ProjectBoot/DISMISS_BOOT_ERROR' as const

// The live scenario context has been released. Separate from any boot action
// because the context outlives the run that created it — it is still there
// after the loader has closed, and only goes away when the user leaves.
export const SCENARIO_DISCARDED = 'app/ProjectBoot/SCENARIO_DISCARDED' as const

// ── Scope loss ───────────────────────────────────────────────────────────────
//
// The project or scenario on screen no longer exists — normally because another
// window deleted it. Raised from utils/scopeError, which every failing call
// funnels through (REST, the raw binary fetch, and the init stream alike).

export const SCOPE_LOST = 'app/ProjectBoot/SCOPE_LOST' as const
export const DISMISS_SCOPE_LOST = 'app/ProjectBoot/DISMISS_SCOPE_LOST' as const
