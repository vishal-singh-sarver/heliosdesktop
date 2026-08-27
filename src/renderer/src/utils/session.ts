const SESSION_KEY = 'helios_session_id'

// The id for THIS run of the app, held in memory as well as in localStorage.
//
// Every call must return the same string, because the backend scopes projects
// by session: `_assert_project_owned` filters on session_id and 404s a project
// that belongs to a different one. That 404 carries no error code, so
// utils/scopeError reads it as "this project was deleted" and throws the user
// back to the home page.
//
// localStorage alone was not enough to guarantee that. The id is read at three
// places — once at module load for the axios default header (utils/api), and
// again PER CALL for the init SSE url (ProjectBoot/service, because EventSource
// cannot set headers) and the binary geometry fetch (3DWindow/api/geometry).
// Where storage is unavailable — a packaged renderer on file://, a locked-down
// profile directory — `getItem` returns null forever and `setItem` keeps
// nothing, so each of those calls minted a BRAND NEW uuid. The axios calls all
// shared the one captured at load and succeeded; the init stream arrived under
// a session that owned nothing and 404'd. The project was never gone: it just
// belonged to a different session id than the one asking for it, on every
// single open.
//
// Caching in the module fixes that outright: storage becomes an optimisation
// for surviving a restart, not the thing that holds the run together. With it
// working nothing changes; with it dead the app still runs consistently for the
// session and only forgets its projects on the next launch.
let cachedId: string | null = null

export function getSessionId(): string {
  if (cachedId) return cachedId

  try {
    // Trim before use. Whitespace is never part of an id, but once written it
    // survives in localStorage forever — and it fails ASYMMETRICALLY, which is
    // what makes it so hard to see. Browsers strip trailing whitespace from
    // request HEADER values, so every axios call still matched its session and
    // returned 200. The init SSE url carries the id as a QUERY PARAMETER
    // instead (EventSource cannot set headers), where a stray "\n" is
    // faithfully encoded as %0A and reaches the backend as a DIFFERENT session.
    // That stream then answers HTTP 200 with an in-band
    // {"error": "... not found", "status": 404} body — so devtools shows four
    // green requests while the user gets "this project no longer exists".
    const raw = localStorage.getItem(SESSION_KEY)
    const stored = raw?.trim()
    if (stored) {
      cachedId = stored
      // Persist the repair so the next launch starts clean. Best-effort and
      // separately guarded: a failed write must not fall through to minting a
      // new id, which would orphan every project owned by the stored one.
      if (stored !== raw) {
        try {
          localStorage.setItem(SESSION_KEY, stored)
        } catch {
          /* not persistable — the trim still holds for this run */
        }
      }
      return cachedId
    }
  } catch {
    /* storage unavailable — fall through and mint one for this run */
  }

  cachedId = crypto.randomUUID()
  try {
    localStorage.setItem(SESSION_KEY, cachedId)
  } catch {
    /* not persistable — the in-memory copy still keeps this run consistent */
  }
  return cachedId
}

export function clearSessionId(): void {
  cachedId = null
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* nothing stored to remove */
  }
}
