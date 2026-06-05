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
  }
} as const

export default messages
