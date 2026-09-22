import { describe, expect, it } from 'vitest'
import toastMessages from '../toastMessages'

// The wording comes from a design spec, so these are transcription tests: they
// pin the exact strings a user reads. A message changing here should be a
// deliberate edit, not a side effect of refactoring the sagas that raise them.

describe('toastMessages', () => {
  it('names both the old and the new name when a project is renamed', () => {
    expect(toastMessages.projectRenamed('Coastal', 'Coastal v2')).toBe(
      'Project "Coastal" has been successfully renamed to "Coastal v2".'
    )
  })

  it('matches the spec for every named single-subject action', () => {
    expect(toastMessages.projectDeleted('Coastal')).toBe(
      'Project "Coastal" has been successfully deleted.'
    )
    expect(toastMessages.weatherFileUploaded('weather.csv')).toBe(
      'Weather file "weather.csv" has been successfully uploaded.'
    )
    expect(toastMessages.weatherFileDeleted('weather.csv')).toBe(
      'Weather file "weather.csv" has been successfully deleted.'
    )
    expect(toastMessages.columnAdded('Air Temp')).toBe(
      'Column "Air Temp" has been successfully added.'
    )
    expect(toastMessages.columnDeleted('Air Temp')).toBe(
      'Column "Air Temp" has been successfully deleted.'
    )
    // Ground and Material names already carry their kind ("Ground.001"), so the
    // copy doesn't say it twice.
    expect(toastMessages.groundCreated('Ground.001')).toBe(
      '"Ground.001" has been successfully created.'
    )
    expect(toastMessages.groundDeleted('Ground.001')).toBe(
      '"Ground.001" has been successfully deleted.'
    )
    expect(toastMessages.materialCreated('Material.001')).toBe(
      '"Material.001" has been successfully created.'
    )
    expect(toastMessages.materialDeleted('Material.001')).toBe(
      '"Material.001" has been successfully deleted.'
    )
    expect(toastMessages.materialAssigned('Grass', 'Ground.001')).toBe(
      'Material "Grass" has been successfully assigned to "Ground.001".'
    )
    expect(toastMessages.changesSaved).toBe('Changes have been successfully saved')
  })

  describe('row counts', () => {
    it('drops the number entirely for a single row', () => {
      // "1 rows have been…" is the giveaway of a template that never got read.
      expect(toastMessages.rowsAdded(1)).toBe('Row has been successfully added.')
      expect(toastMessages.rowsDeleted(1)).toBe('Row has been successfully deleted.')
      expect(toastMessages.rowsAddFailed(1)).toBe('Row could not be added.')
      expect(toastMessages.rowsDeleteFailed(1)).toBe('Row could not be deleted.')
    })

    it('counts and pluralises anything else', () => {
      expect(toastMessages.rowsAdded(24)).toBe('24 rows have been successfully added.')
      expect(toastMessages.rowsDeleted(3)).toBe('3 rows have been successfully deleted.')
      expect(toastMessages.rowsAddFailed(24)).toBe('24 rows could not be added.')
      expect(toastMessages.rowsDeleteFailed(3)).toBe('3 rows could not be deleted.')
    })
  })

  describe('failures', () => {
    it('names the same subject the success would have', () => {
      expect(toastMessages.projectRenameFailed('Coastal')).toBe(
        'Project "Coastal" could not be renamed.'
      )
      expect(toastMessages.weatherFileUploadFailed('weather.csv')).toBe(
        'Weather file "weather.csv" could not be uploaded.'
      )
      expect(toastMessages.materialAssignFailed('Grass', 'Ground.001')).toBe(
        'Material "Grass" could not be assigned to "Ground.001".'
      )
      expect(toastMessages.changesSaveFailed).toBe('Changes could not be saved')
    })

    it('says plainly that a create failed, with no name to give', () => {
      // The backend assigns the name, so a create that never landed has none.
      expect(toastMessages.groundCreateFailed).toBe('Ground could not be created.')
    })
  })
})
