const messages = {
  header: 'This is the Weather container!',
  importTriggerButton: 'Import Weather Data',

  addColumn: {
    dialogTitle: 'Add Column',
    submitButton: 'Add',
    submitButtonBusy: 'Adding…',
    cancelButton: 'Cancel',
    fields: {
      name: 'Column Name',
      dataType: 'Data Type',
      unit: 'Unit Type',
      value: 'Enter Value'
    },
    placeholders: {
      dataType: 'Select data type',
      unit: 'Select a unit',
      unitDisabled: 'Select a data type first'
    },
    errors: {
      duplicateName: 'A column with this name already exists',
      serverError: 'Failed to add column'
    }
  },

  addRows: {
    dialogTitle: 'New Rows',
    submitButton: 'Add',
    submitButtonBusy: 'Adding…',
    cancelButton: 'Cancel',
    errors: {
      serverError: 'Failed to add rows'
    }
  },

  deleteImport: {
    dialogTitle: 'Delete',
    heading: 'Delete Data',
    body: 'Are you sure you want to delete this? This action cannot be undone.',
    confirmButton: 'Delete',
    cancelButton: 'Cancel'
  },

  importConfirm: {
    dialogTitle: 'Import Weather Data',
    heading: 'Replace existing weather data?',
    body: 'Importing this file will erase the current weather data for this scenario. This action cannot be undone.',
    confirmButton: 'Yes',
    cancelButton: 'No'
  },

  deleteColumn: {
    dialogTitle: 'Delete',
    heading: (name: string) => `Delete ${name}`,
    body: 'Are you sure you want to delete this column? This action cannot be undone.',
    confirmButton: 'Delete',
    cancelButton: 'Cancel'
  },

  deleteRow: {
    dialogTitle: 'Delete',
    heading: 'Delete Row',
    body: 'Are you sure you want to delete this? This action cannot be undone.',
    confirmButton: 'Delete',
    cancelButton: 'Cancel'
  },

  deleteSelectedRows: {
    dialogTitle: 'Delete',
    heading: 'Delete Selected Rows',
    body: 'Are you sure you want to delete these rows? This action cannot be undone.',
    confirmButton: 'Delete',
    cancelButton: 'Cancel'
  },

  selection: {
    // The count is rendered separately so it can be emphasised, so this is only
    // the trailing clause. Reads naturally at 1 rather than saying "1 rows".
    summary: (count: number): string => (count === 1 ? 'row is selected' : 'rows are selected'),
    deleteButton: 'Delete'
  }
} as const

export default messages
