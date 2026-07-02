export interface FormValues {
  projectName: string
  latitude: string
  longitude: string
}

// New projects default to the UC Davis main campus (38.5400° N, 121.7500° W).
// Longitude is negative for West, per the form's decimal-degrees convention.
export const INITIAL_VALUES: FormValues = {
  projectName: '',
  latitude: '38.54',
  longitude: '-121.75'
}

export interface SidebarItem {
  label: string
  icon: string
  onAction: () => void
}

export type ToolbarMap = Record<string, string[]>

export const TOOLBAR_ITEMS: ToolbarMap = {
  File: ['New Project', 'Open Project', 'Import Project', 'Exit'],
  Edit: ['Undo', 'Redo', 'Preferences'],
  View: ['Zoom In', 'Zoom Out', 'Reset Layout'],
  Tools: ['Scripting Console', 'Extensions', 'Diagnostics'],
  Help: ['Documentation', 'Shortcuts', 'About Helios']
}
