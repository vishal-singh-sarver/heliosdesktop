const messages = {
  loader: {
    title: 'Opening',
    cancelButton: 'Cancel',
    // The loader's body text comes from the backend's `message` field and
    // nowhere else — no phase names, no fallbacks, no "almost there". If the
    // server has not said anything yet, the loader says nothing. `counts` is
    // the one exception, and it formats the server's own done/total numbers
    // rather than inventing a sentence.
    counts: (done: number, total: number) => `${done} of ${total}`
  },

  error: {
    title: 'Could not open project',
    retryButton: 'Retry',
    homeButton: 'Go to Home',
    generic: 'Something went wrong while opening this project.'
  },

  scopeLost: {
    title: 'Project unavailable',
    homeButton: 'Go to Home',
    project: 'This project no longer exists. It may have been deleted in another window.',
    scenario: 'This scenario no longer exists. It may have been deleted in another window.'
  }
} as const

export default messages
