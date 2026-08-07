import Dialog from '@renderer/components/Dialog'
import type { FormFieldOption } from '@renderer/components/FormField'
import FormField from '@renderer/components/FormField'
import { Spinner } from '@renderer/components/LoadingScreen/Spinner'
import { addColumnRequested, addColumnReset } from 'containers/ProjectScreen/actions'
import type { ColumnDef, DataTypeDef } from 'containers/ProjectScreen/types'
import { useFormik } from 'formik'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { exceedsMaxDecimals, expandForDisplay, isIncompleteExponent } from 'utils/decimalValidation'
import messages from './messages'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectAddColumnError,
  selectAddColumnLoading,
  selectSelectableDataTypes
} from './selectors'
import { validateCellValue } from './validation'

export interface AddColumnValues {
  parameterName: string
  // Stored as string because <select> values are strings; "" === unselected.
  // Resolved to numeric ids (or null) at submit time.
  dataTypeId: string
  unitId: string
  defaultValue: string
}

const INITIAL_VALUES: AddColumnValues = {
  parameterName: '',
  dataTypeId: '',
  unitId: '',
  defaultValue: ''
}

function defaultUnitForType(dataType: DataTypeDef | undefined): DataTypeDef['units'][number] | null {
  if (!dataType) return null
  return dataType.units.find((u) => u.is_base) ?? dataType.units[0] ?? null
}

interface AddColumnDialogProps {
  isOpen: boolean
  onClose: () => void
}

function AddColumnDialog({ isOpen, onClose }: AddColumnDialogProps): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)
  const dataTypes = useSelector(selectSelectableDataTypes)
  const loading = useSelector(selectAddColumnLoading)
  const error = useSelector(selectAddColumnError)
  // True while Default Value sits mid-exponent ("1e", "1e-") because the user is
  // typing one. Set on keystroke, cleared on blur — see the field's onChange.
  const [typingExponent, setTypingExponent] = React.useState(false)

  const dataTypeOptions: FormFieldOption[] = React.useMemo(
    () => dataTypes.map((dt) => ({ value: String(dt.id), label: dt.data_type })),
    [dataTypes]
  )

  const formik = useFormik<AddColumnValues>({
    initialValues: INITIAL_VALUES,
    validateOnChange: true,
    validateOnBlur: true,
    validate: (values) => {
      const errors: Partial<Record<keyof AddColumnValues, string>> = {}

      const trimmedName = values.parameterName.trim()
      if (!trimmedName) {
        errors.parameterName = 'Column name is required.'
      } else if (trimmedName.length > 30) {
        errors.parameterName = 'Column name must have 30 characters or fewer.'
      }

      const dataTypeId = values.dataTypeId === '' ? null : Number(values.dataTypeId)
      const unitId = values.unitId === '' ? null : Number(values.unitId)
      const validationCol: ColumnDef = {
        id: 'new-column',
        name: trimmedName || 'Value',
        dataTypeId,
        unitId
      }
      const trimmedDefault = values.defaultValue.trim()
      if (trimmedDefault !== '' && !Number.isFinite(Number(trimmedDefault))) {
        // Catalog-aware range check (validateCellValue) only kicks in once a
        // unit is selected; enforce numeric-only here so garbage text can't
        // slip through when Data Type / Unit are left unset.
        errors.defaultValue = 'Default value must be a number.'
      } else if (trimmedDefault !== '' && exceedsMaxDecimals(trimmedDefault)) {
        // exceedsMaxDecimals, not a split('.') character count: it EXPANDS the
        // value first, so "1e-9" is measured as 0.000000001 — nine places — rather
        // than as a string containing no '.' at all. The old count returned 0 for
        // every exponent-form value, so a 9-decimal default sailed through to the
        // backend, whose weather-side check has the same blind spot, and each cell
        // then read back as 0 (its read path rounds to 7). The cell editor beside
        // this dialog has always used this function; this brings the two in line.
        errors.defaultValue = 'Default value can have at most 7 decimal places.'
      } else {
        const defaultValueError = validateCellValue(values.defaultValue, {
          col: validationCol,
          dataTypes
        })
        if (defaultValueError) errors.defaultValue = defaultValueError
      }

      return errors
    },
    onSubmit: (values, helpers) => {
      if (loading || !projectId || !scenarioId) return
      const dataTypeId = values.dataTypeId === '' ? null : Number(values.dataTypeId)
      const unitId = values.unitId === '' ? null : Number(values.unitId)
      // Expand HERE as well as on blur. Dialog reaches its primary button through
      // .click() (see components/Dialog triggerPrimary), which fires no blur — so
      // submitting with Enter dispatched the raw "1e3" while a mouse click (whose
      // mousedown moves focus, and so DOES blur the input) dispatched "1000". That
      // string is written verbatim into every cell of the new column, both in the
      // request body and in the reducer's optimistic fill, so the two routes
      // produced different DATA for the same keystrokes.
      //
      // Idempotent — an expanded value has no exponent left to expand.
      const defaultValue = expandForDisplay(values.defaultValue)
      // Keep the box honest if the add fails and the dialog stays open.
      if (defaultValue !== values.defaultValue) {
        void helpers.setFieldValue('defaultValue', defaultValue)
      }
      // Don't close here — the toolbar listens for the loading→idle
      // transition and only closes when the request actually succeeded.
      // On failure the dialog stays open with the error banner visible.
      dispatch(
        addColumnRequested(
          projectId,
          scenarioId,
          values.parameterName.trim(),
          dataTypeId,
          unitId,
          defaultValue
        )
      )
    }
  })

  // Reset the form whenever the dialog closes — covers both user Cancel and
  // success-driven close from the toolbar. Also clear the saga request status
  // so a prior failure's error banner doesn't persist into the next open.
  React.useEffect(() => {
    if (!isOpen) {
      formik.resetForm()
      dispatch(addColumnReset())
    }
    // formik is intentionally omitted: we only want this on isOpen edges,
    // and including formik would re-fire on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Unit options follow the selected data type. Picking a different data type
  // clears the unit selection — the user must re-pick (per task constraints,
  // we don't auto-select the base unit).
  const selectedDataType = React.useMemo(
    () =>
      formik.values.dataTypeId === ''
        ? undefined
        : dataTypes.find((dt) => String(dt.id) === formik.values.dataTypeId),
    [dataTypes, formik.values.dataTypeId]
  )

  const unitOptions: FormFieldOption[] = React.useMemo(
    () =>
      (selectedDataType?.units ?? []).map((u) => ({
        value: String(u.id),
        label: u.alias ? `${u.unit} (${u.alias})` : u.unit
      })),
    [selectedDataType]
  )

  // Mirror the column header (DataTypeUnitPicker) which displays `u.unit`
  // when a unit is set — so the default-value field reads the same way.
  const selectedUnit = React.useMemo(
    () =>
      formik.values.unitId === ''
        ? undefined
        : selectedDataType?.units.find((u) => String(u.id) === formik.values.unitId),
    [selectedDataType, formik.values.unitId]
  )

  const handleDataTypeChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const nextDataTypeId = e.target.value
    const nextDataType =
      nextDataTypeId === '' ? undefined : dataTypes.find((dt) => String(dt.id) === nextDataTypeId)
    const nextUnit = defaultUnitForType(nextDataType)

    formik.setValues({
      ...formik.values,
      dataTypeId: nextDataTypeId,
      unitId: nextUnit ? String(nextUnit.id) : ''
    })
  }

  const handleClose = (): void => {
    if (loading) return
    onClose()
  }

  const m = messages.addColumn

  return (
    <Dialog isOpen={isOpen} title={m.dialogTitle} onClose={handleClose}>
      <FormField
        labelProps={{ label: m.fields.name }}
        inputProps={{
          ...formik.getFieldProps('parameterName'),
          error:
            formik.touched.parameterName || formik.values.parameterName !== ''
              ? (formik.errors.parameterName as string | undefined)
              : undefined
        }}
      />

      <FormField
        labelProps={{ label: m.fields.dataType, optional: true }}
        inputProps={{
          ...formik.getFieldProps('dataTypeId'),
          onChange: handleDataTypeChange,
          placeholder: m.placeholders.dataType,
          options: dataTypeOptions
        }}
      />

      <FormField
        labelProps={{ label: m.fields.unit, optional: true }}
        inputProps={{
          ...formik.getFieldProps('unitId'),
          placeholder:
            formik.values.dataTypeId === '' ? m.placeholders.unitDisabled : m.placeholders.unit,
          disabled: formik.values.dataTypeId === '',
          options: unitOptions
        }}
      />

      <FormField
        labelProps={{
          label: selectedUnit ? `${m.fields.value} (${selectedUnit.unit})` : m.fields.value,
          optional: true
        }}
        inputProps={{
          ...formik.getFieldProps('defaultValue'),
          onChange: (e) => {
            // "1e" / "1e-" is a number still being typed — Number() is NaN, so the
            // validator would flash "must be a number" between the 'e' and the
            // exponent digit. Held back until blur ends the run.
            setTypingExponent(isIncompleteExponent(e.target.value))
            formik.handleChange(e)
          },
          onBlur: (e) => {
            setTypingExponent(false)
            formik.handleBlur(e)
            // Expand on blur so the box shows the value that will be written to
            // every cell of the new column ("1e3" -> "1000"), matching the cell
            // editor. Value-preserving, so the validation formik re-runs on
            // setFieldValue returns the same answer either way.
            const expanded = expandForDisplay(formik.values.defaultValue)
            if (expanded !== formik.values.defaultValue) {
              void formik.setFieldValue('defaultValue', expanded)
            }
          },
          // Suppressed only while the flag AND the value agree that a number is
          // mid-typing. Requiring both means a flag left set by closing the dialog
          // without blurring (Escape, the X) cannot hide a later error — the value
          // has to actually end in a bare exponent for the suppression to apply.
          error:
            !(typingExponent && isIncompleteExponent(formik.values.defaultValue)) &&
            (formik.touched.defaultValue || formik.values.defaultValue !== '')
              ? (formik.errors.defaultValue as string | undefined)
              : undefined
        }}
      />

      {error && (
        <p role="alert" className="form-error-text pt-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={handleClose}
          disabled={loading}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100 disabled:opacity-50"
        >
          {m.cancelButton}
        </button>
        <button
          onClick={() => formik.submitForm()}
          disabled={loading || Boolean(formik.errors.defaultValue)}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner />
              {m.submitButtonBusy}
            </span>
          ) : (
            m.submitButton
          )}
        </button>
      </div>
    </Dialog>
  )
}

export default AddColumnDialog
