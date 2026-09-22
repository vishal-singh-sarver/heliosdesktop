import Dialog from '@renderer/components/Dialog'
import messages from '@renderer/containers/ProjectBoot/messages'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { dismissScopeLost } from 'containers/ProjectBoot/actions'
import { selectScopeLoss } from 'containers/ProjectBoot/selectors'

/**
 * Shown when the open project or scenario has been deleted underneath the user.
 *
 * Launching Helios twice does not start a second app — the single-instance lock
 * turns it into a second window on the same process, backend and session. So a
 * project deleted in one window is really gone for the other, which keeps
 * showing a screen full of data that no longer exists until it next calls the
 * backend and gets a 404.
 *
 * A toast would not be enough: everything behind this dialog is dead. Going
 * home is the only sensible action, so it is the only one offered.
 */
function ScopeLostDialog(): React.JSX.Element | null {
  const dispatch = useDispatch()
  const loss = useSelector(selectScopeLoss)

  if (!loss) return null

  const body =
    loss.kind === 'scenario' ? messages.scopeLost.scenario : messages.scopeLost.project

  const goHome = (): void => {
    dispatch(dismissScopeLost())
  }

  return (
    <Dialog isOpen title={messages.scopeLost.title} onClose={goHome}>
      <p className="text-sm text-neutral-300">{body}</p>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={goHome}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
        >
          {messages.scopeLost.homeButton}
        </button>
      </div>
    </Dialog>
  )
}

export default ScopeLostDialog
