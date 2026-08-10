import { fireEvent, render, screen, within } from '@testing-library/react'
import { INITIAL_MAPPING, type DateTimeMapping, type ParseResult } from 'containers/Weather/parsers'
import StepDateTime from '../StepDateTime'
import type { StepDateTimeProps } from '../types'

const group1Parsed: ParseResult = {
  format: 'csv',
  delimiter: ',',
  headerLinesToSkip: 0,
  headers: ['year', 'month', 'day', 'hour', 'minute'],
  rows: [
    ['2026', '2', '26', '10', '0'],
    ['2026', '2', '26', '11', '0']
  ]
}

const group1Mapping: DateTimeMapping = {
  ...INITIAL_MAPPING,
  year: 'year',
  month: 'month',
  day: 'day',
  hour: 'hour',
  minute: 'minute'
}

const group2Parsed: ParseResult = {
  format: 'csv',
  delimiter: ',',
  headerLinesToSkip: 0,
  headers: ['Date', 'Time', 'temp'],
  rows: [
    ['26/02/2026', '10:00', '22.5'],
    ['26/02/2026', '99:99', '23.7']
  ]
}

const group2Mapping: DateTimeMapping = {
  ...INITIAL_MAPPING,
  date: 'Date',
  time: 'Time'
}

const group3Parsed: ParseResult = {
  format: 'csv',
  delimiter: ',',
  headerLinesToSkip: 0,
  headers: ['Timestamp', 'temp'],
  rows: [
    ['2026-02-26T10:00:00Z', '22.5'],
    ['2026-02-26T11:15:00Z', '23.7']
  ]
}

const group3Mapping: DateTimeMapping = {
  ...INITIAL_MAPPING,
  datetime: 'Timestamp'
}

const julianParsed: ParseResult = {
  format: 'csv',
  delimiter: ',',
  headerLinesToSkip: 0,
  headers: ['Year', 'DOY', 'temp'],
  rows: [
    ['2024', '172', '286.25'],
    ['2024', '173', '285.55']
  ]
}

const julianMapping: DateTimeMapping = {
  ...INITIAL_MAPPING,
  julianYear: 'Year',
  julianDay: 'DOY'
}

// Render the real StepDateTime with sensible defaults, returning the (mostly
// vi.fn()) props so a test can assert the exact payloads the component emits.
function renderStep(overrides: Partial<StepDateTimeProps> = {}): StepDateTimeProps {
  const props: StepDateTimeProps = {
    parsed: group1Parsed,
    dateMode: 'parts',
    onChangeDateMode: vi.fn(),
    timeMode: 'parts',
    onChangeTimeMode: vi.fn(),
    mapping: group1Mapping,
    onChangeMapping: vi.fn(),
    dateFormat: 'YYYY-MM-DD',
    onChangeDateFormat: vi.fn(),
    datetimeFormat: 'YYYY-MM-DDTHH:MM:SSZ',
    onChangeDateTimeFormat: vi.fn(),
    ambiguousDateFormat: null,
    stats: { configReady: true, valid: 2, invalid: 0, total: 2 },
    ...overrides
  }
  render(<StepDateTime {...props} />)
  return props
}

describe('<StepDateTime />', () => {
  const baseStats = { configReady: true, valid: 2, invalid: 0, total: 2 }

  it('renders all five Group 1 mapping rows', () => {
    render(
      <StepDateTime
        parsed={group1Parsed}
        dateMode="parts"
        onChangeDateMode={vi.fn()}
        timeMode="parts"
        onChangeTimeMode={vi.fn()}
        mapping={group1Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="YYYY-MM-DD"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={baseStats}
      />
    )
    expect(screen.getByText('Day')).toBeInTheDocument()
    expect(screen.getByText('Month')).toBeInTheDocument()
    expect(screen.getByText('Year')).toBeInTheDocument()
    expect(screen.getByText('Hour')).toBeInTheDocument()
    expect(screen.getByText('Minute')).toBeInTheDocument()
  })

  it('renders all three date/time mapping sections on one page', () => {
    render(
      <StepDateTime
        parsed={group2Parsed}
        dateMode="string"
        onChangeDateMode={vi.fn()}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={baseStats}
      />
    )
    expect(screen.getByText('Year')).toBeInTheDocument()
    expect(screen.getByText('Date String')).toBeInTheDocument()
    expect(screen.getByText('Date-Time')).toBeInTheDocument()
  })

  it('clicking another card calls onChangeDateMode', () => {
    const onChangeDateMode = vi.fn()
    render(
      <StepDateTime
        parsed={group2Parsed}
        dateMode="string"
        onChangeDateMode={onChangeDateMode}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={baseStats}
      />
    )
    const partsCard = screen.getByLabelText('day month year')
    const grid = partsCard.closest('.grid') as HTMLElement
    fireEvent.click(within(grid).getByRole('button'))
    expect(onChangeDateMode).toHaveBeenCalledWith('parts')
  })

  it('disables controls in unselected date cards', () => {
    render(
      <StepDateTime
        parsed={group2Parsed}
        dateMode="string"
        onChangeDateMode={vi.fn()}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={baseStats}
      />
    )

    const partsCard = screen.getByLabelText('day month year')
    const dateStringCard = screen.getByLabelText('date string')
    const dateTimeCard = screen.getByLabelText('date-time')

    within(partsCard)
      .getAllByRole('combobox')
      .forEach((select) => expect(select).toBeDisabled())
    within(dateStringCard)
      .getAllByRole('combobox')
      .forEach((select) => expect(select).not.toBeDisabled())
    within(dateTimeCard)
      .getAllByRole('combobox')
      .forEach((select) => expect(select).toBeDisabled())
  })

  it('shows formatted parsed Date-Time in the preview for valid rows', () => {
    render(
      <StepDateTime
        parsed={group2Parsed}
        dateMode="string"
        onChangeDateMode={vi.fn()}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={baseStats}
      />
    )
    // Row 1 has "26/02/2026 10:00" → formatted via en-US locale in 24-hour clock
    expect(screen.getByText(/2\/26\/2026, 10:00:00/)).toBeInTheDocument()
  })

  it('shows "Invalid time format" when time is unparseable but date is OK', () => {
    render(
      <StepDateTime
        parsed={group2Parsed}
        dateMode="string"
        onChangeDateMode={vi.fn()}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={baseStats}
      />
    )
    expect(screen.getByText('Invalid time format')).toBeInTheDocument()
  })

  it('shows "Invalid" when the date itself is unparseable', () => {
    const badDate: ParseResult = {
      ...group2Parsed,
      rows: [['garbage-date', '10:00', '22.5']]
    }
    render(
      <StepDateTime
        parsed={badDate}
        dateMode="string"
        onChangeDateMode={vi.fn()}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={{ configReady: true, valid: 0, invalid: 1, total: 1 }}
      />
    )
    expect(screen.getByText('Invalid')).toBeInTheDocument()
  })

  it('renders the "All rows valid" badge when invalid count is 0', () => {
    render(
      <StepDateTime
        parsed={group1Parsed}
        dateMode="parts"
        onChangeDateMode={vi.fn()}
        timeMode="parts"
        onChangeTimeMode={vi.fn()}
        mapping={group1Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="YYYY-MM-DD"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={{ configReady: true, valid: 2, invalid: 0, total: 2 }}
      />
    )
    expect(screen.getByText(/All 2 rows valid/)).toBeInTheDocument()
  })

  it('renders the partial-valid banner when there is a mix', () => {
    render(
      <StepDateTime
        parsed={group2Parsed}
        dateMode="string"
        onChangeDateMode={vi.fn()}
        timeMode="string"
        onChangeTimeMode={vi.fn()}
        mapping={group2Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="DD/MM/YYYY"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={{ configReady: true, valid: 1, invalid: 1, total: 2 }}
      />
    )
    expect(screen.getByText(/1 of 2 valid/)).toBeInTheDocument()
    expect(screen.getByText(/1 invalid/)).toBeInTheDocument()
  })

  it('renders combined Date-Time mode and previews ISO rows', () => {
    render(
      <StepDateTime
        parsed={group3Parsed}
        dateMode="datetime"
        onChangeDateMode={vi.fn()}
        timeMode="none"
        onChangeTimeMode={vi.fn()}
        mapping={group3Mapping}
        onChangeMapping={vi.fn()}
        dateFormat="YYYY-MM-DD"
        onChangeDateFormat={vi.fn()}
        datetimeFormat="YYYY-MM-DDTHH:MM:SSZ"
        onChangeDateTimeFormat={vi.fn()}
        ambiguousDateFormat={null}
        stats={{ configReady: true, valid: 2, invalid: 0, total: 2 }}
      />
    )

    expect(screen.getByLabelText('date-time')).toBeInTheDocument()
    expect(screen.getAllByText(/2\/26\/2026/).length).toBeGreaterThan(0)
  })
})

describe('<StepDateTime /> — mapping-dropdown callbacks', () => {
  it('parts date mode: Day/Month/Year selects emit onChangeMapping (null when cleared)', () => {
    const p = renderStep({ dateMode: 'parts', mapping: group1Mapping })
    fireEvent.change(screen.getByTestId('dt-day'), { target: { value: 'month' } })
    fireEvent.change(screen.getByTestId('dt-month'), { target: { value: 'day' } })
    fireEvent.change(screen.getByTestId('dt-year'), { target: { value: '' } })
    expect(p.onChangeMapping).toHaveBeenCalledWith('day', 'month')
    expect(p.onChangeMapping).toHaveBeenCalledWith('month', 'day')
    expect(p.onChangeMapping).toHaveBeenCalledWith('year', null)
  })

  it('julian date mode: Julian Year/Day selects emit onChangeMapping', () => {
    const p = renderStep({
      parsed: julianParsed,
      dateMode: 'julian',
      timeMode: 'none',
      mapping: julianMapping
    })
    fireEvent.change(screen.getByTestId('dt-julianYear'), { target: { value: 'temp' } })
    fireEvent.change(screen.getByTestId('dt-julianDay'), { target: { value: 'temp' } })
    expect(p.onChangeMapping).toHaveBeenCalledWith('julianYear', 'temp')
    expect(p.onChangeMapping).toHaveBeenCalledWith('julianDay', 'temp')
  })

  it('date-string mode: format + column selects emit onChangeDateFormat / onChangeMapping', () => {
    const p = renderStep({
      parsed: group2Parsed,
      dateMode: 'string',
      timeMode: 'string',
      mapping: group2Mapping,
      dateFormat: 'DD/MM/YYYY'
    })
    fireEvent.change(screen.getByTestId('dt-date-format'), { target: { value: 'YYYY-MM-DD' } })
    fireEvent.change(screen.getByTestId('dt-date'), { target: { value: 'temp' } })
    expect(p.onChangeDateFormat).toHaveBeenCalledWith('YYYY-MM-DD')
    expect(p.onChangeMapping).toHaveBeenCalledWith('date', 'temp')
  })

  it('date-string format select ignores the empty/placeholder value', () => {
    const p = renderStep({
      parsed: group2Parsed,
      dateMode: 'string',
      timeMode: 'string',
      mapping: group2Mapping,
      dateFormat: 'DD/MM/YYYY'
    })
    fireEvent.change(screen.getByTestId('dt-date-format'), { target: { value: '' } })
    expect(p.onChangeDateFormat).not.toHaveBeenCalled()
  })

  it('date-time mode: format + column selects emit onChangeDateTimeFormat / onChangeMapping', () => {
    const p = renderStep({
      parsed: group3Parsed,
      dateMode: 'datetime',
      timeMode: 'none',
      mapping: group3Mapping
    })
    fireEvent.change(screen.getByTestId('dt-datetime-format'), { target: { value: 'YYYYMMDDHH' } })
    fireEvent.change(screen.getByTestId('dt-datetime'), { target: { value: 'temp' } })
    expect(p.onChangeDateTimeFormat).toHaveBeenCalledWith('YYYYMMDDHH')
    expect(p.onChangeMapping).toHaveBeenCalledWith('datetime', 'temp')
  })

  it('date-time format select ignores the empty/placeholder value', () => {
    const p = renderStep({
      parsed: group3Parsed,
      dateMode: 'datetime',
      timeMode: 'none',
      mapping: group3Mapping
    })
    fireEvent.change(screen.getByTestId('dt-datetime-format'), { target: { value: '' } })
    expect(p.onChangeDateTimeFormat).not.toHaveBeenCalled()
  })

  it('clicking each date-mode radio emits onChangeDateMode with that mode', () => {
    const p = renderStep({ dateMode: 'string' })
    fireEvent.click(screen.getByTestId('dt-datemode-parts'))
    fireEvent.click(screen.getByTestId('dt-datemode-string'))
    fireEvent.click(screen.getByTestId('dt-datemode-julian'))
    fireEvent.click(screen.getByTestId('dt-datemode-datetime'))
    expect(p.onChangeDateMode).toHaveBeenCalledWith('parts')
    expect(p.onChangeDateMode).toHaveBeenCalledWith('string')
    expect(p.onChangeDateMode).toHaveBeenCalledWith('julian')
    expect(p.onChangeDateMode).toHaveBeenCalledWith('datetime')
  })

  it('clicking each time-mode radio emits onChangeTimeMode (time not disabled)', () => {
    const p = renderStep({ dateMode: 'parts', timeMode: 'parts' })
    fireEvent.click(screen.getByTestId('dt-timemode-parts'))
    fireEvent.click(screen.getByTestId('dt-timemode-string'))
    fireEvent.click(screen.getByTestId('dt-timemode-compact'))
    expect(p.onChangeTimeMode).toHaveBeenCalledWith('parts')
    expect(p.onChangeTimeMode).toHaveBeenCalledWith('string')
    expect(p.onChangeTimeMode).toHaveBeenCalledWith('compact')
  })

  it('parts time mode: Hour/Minute selects emit onChangeMapping', () => {
    const p = renderStep({ dateMode: 'parts', timeMode: 'parts', mapping: group1Mapping })
    fireEvent.change(screen.getByTestId('dt-hour'), { target: { value: 'minute' } })
    fireEvent.change(screen.getByTestId('dt-minute'), { target: { value: 'hour' } })
    expect(p.onChangeMapping).toHaveBeenCalledWith('hour', 'minute')
    expect(p.onChangeMapping).toHaveBeenCalledWith('minute', 'hour')
  })

  it('string time mode: Hour:Minute select emits onChangeMapping("time", …)', () => {
    const p = renderStep({
      parsed: group2Parsed,
      dateMode: 'string',
      timeMode: 'string',
      mapping: group2Mapping,
      dateFormat: 'DD/MM/YYYY'
    })
    fireEvent.change(screen.getByTestId('dt-time-string'), { target: { value: 'temp' } })
    expect(p.onChangeMapping).toHaveBeenCalledWith('time', 'temp')
  })

  it('compact time mode: HourMinute select emits onChangeMapping("time", …)', () => {
    const p = renderStep({
      parsed: group2Parsed,
      dateMode: 'string',
      timeMode: 'compact',
      mapping: group2Mapping,
      dateFormat: 'DD/MM/YYYY'
    })
    fireEvent.change(screen.getByTestId('dt-time-compact'), { target: { value: 'temp' } })
    expect(p.onChangeMapping).toHaveBeenCalledWith('time', 'temp')
  })
})

describe('<StepDateTime /> — preview for julian and partial mappings', () => {
  it('julian date mode: preview echoes the raw DOY and the exact parsed instant', () => {
    renderStep({
      parsed: julianParsed,
      dateMode: 'julian',
      timeMode: 'none',
      mapping: julianMapping
    })
    // Raw column joins julianYear + julianDay.
    expect(screen.getByText('2024 172')).toBeInTheDocument()
    expect(screen.getByText('2024 173')).toBeInTheDocument()
    // DOY 172 of leap-year 2024 = 20 June; DOY 173 = 21 June. Midnight renders
    // as either "00:00:00" or "24:00:00" under en-US hour12:false depending on
    // the runtime's ICU version (older ICU used the "24:00:00" quirk), so accept both.
    expect(screen.getByText(/6\/20\/2024, (00|24):00:00/)).toBeInTheDocument()
    expect(screen.getByText(/6\/21\/2024, (00|24):00:00/)).toBeInTheDocument()
  })

  it('parts time mode: preview joins only the mapped Hour column when Minute is unmapped', () => {
    const partialMapping: DateTimeMapping = {
      ...INITIAL_MAPPING,
      year: 'year',
      month: 'month',
      day: 'day',
      hour: 'hour'
    }
    renderStep({
      parsed: group1Parsed,
      dateMode: 'parts',
      timeMode: 'parts',
      mapping: partialMapping
    })
    // date parts (year month day) + only the hour column → "2026 2 26 10".
    expect(screen.getByText('2026 2 26 10')).toBeInTheDocument()
  })

  it('preview renders "-- none --" for rows whose mapped columns are all empty', () => {
    renderStep({
      parsed: group2Parsed,
      dateMode: 'string',
      timeMode: 'none',
      mapping: INITIAL_MAPPING,
      stats: { configReady: false, valid: 0, invalid: 2, total: 2 }
    })
    // Scope to the preview cells (span), not the Select placeholder <option>s.
    expect(screen.getAllByText('-- none --', { selector: 'span' })).toHaveLength(2)
    expect(screen.getAllByText('Invalid').length).toBe(2)
  })
})
