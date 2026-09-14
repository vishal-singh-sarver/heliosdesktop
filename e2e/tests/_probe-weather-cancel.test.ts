import Weather from '../pages/Weather.page'
import { enterWeather, waitForBackendReady, waitForMainWindow } from '../support/harness'

describe('PROBE — does the dialog footer move when the focused field blurs?', () => {
  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
  })

  for (const which of ['column', 'rows'] as const) {
    it(`measures Cancel before and after the blur (${which})`, async () => {
      await enterWeather(`probe${which}`)
      if (which === 'column') await Weather.openAddColumns()
      else await Weather.openAddRows()
      const testid = which === 'column' ? 'add-column-dialog' : 'add-rows-dialog'
      const read = async () =>
        browser.execute((id: string) => {
          const dialog = document.querySelector(`[data-testid="${id}"]`)
          const cancel = Array.from(dialog?.querySelectorAll('button') ?? []).find(
            (b) => (b.textContent || '').trim() === 'Cancel'
          )
          const rect = cancel?.getBoundingClientRect()
          const active = document.activeElement as HTMLElement | null
          return {
            focused: active?.getAttribute('name') ?? active?.tagName ?? null,
            cancelTop: rect ? Math.round(rect.top) : null,
            dialogHeight: dialog ? Math.round(dialog.getBoundingClientRect().height) : null
          }
        }, testid)
      const before = await read()
      await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
      await browser.pause(300)
      const after = await read()
      console.log(`[probe] ${which} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      await browser.keys(['Escape'])
    })
  }
})
