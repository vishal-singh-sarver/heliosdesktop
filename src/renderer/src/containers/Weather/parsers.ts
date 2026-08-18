// Pure data utilities for the Import Weather Data flow:
//   - format-agnostic file parsing (CSV/TXT/XML)
//   - strict-on-date / lenient-on-time validation
//   - serialization back to CSV for backend upload
//
// Everything in this file is pure (no I/O, no React, no Redux). Side effects
// — file open, file read, HTTP POST — live in containers/Weather/saga.ts.

// ── Types ─────────────────────────────────────────────────────────────────────

export type FileFormat = 'csv' | 'txt' | 'xml'

export interface ParseResult {
  format: FileFormat
  delimiter: string
  headerLinesToSkip: number
  headers: string[]
  rows: string[][]
}

export type DateTimeMode = 'group1' | 'group2' | 'group3'
export type DateSelectionMode = 'parts' | 'string' | 'julian' | 'datetime'
export type TimeSelectionMode = 'none' | 'parts' | 'string' | 'compact'

export interface DateTimeMapping {
  year: string | null
  month: string | null
  day: string | null
  julianYear: string | null
  julianDay: string | null
  hour: string | null
  minute: string | null
  date: string | null
  time: string | null
  datetime: string | null
}

export const INITIAL_MAPPING: DateTimeMapping = {
  year: null,
  month: null,
  day: null,
  julianYear: null,
  julianDay: null,
  hour: null,
  minute: null,
  date: null,
  time: null,
  datetime: null
}

export type DateFormatKey =
  | 'YYYYMMDD'
  | 'YYYY-MM-DD'
  | 'DD-MM-YYYY'
  | 'MM-DD-YYYY'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY/MM/DD'
  | 'DD.MM.YYYY'
  | 'YYYY DOY'
  | 'DOY YYYY'

export type DateTimeFormatKey =
  | 'YYYY-MM-DDTHH:MM:SSZ'
  | 'YYYY-MM-DDTHH:MM:SS-HH:MM'
  | 'YYYY-MM-DDTHH:MM:SS'
  | 'YYYY-MM-DDTHH:MM'
  | 'YYYYMMDDHH'
  | 'YYYYMMDDHHMM'
  | 'YYYY-MM-DD HH:MM'
  | 'DD/MM/YYYY HH:MM'
  | 'MM/DD/YYYY HH:MM'
  | 'DD-MM-YYYY HH:MM'
  | 'MM-DD-YYYY HH:MM'
  | 'YYYY DOY HH:MM'
  | 'DOY YYYY HH:MM'

interface DateFormatSpec {
  value: DateFormatKey
  label: string
  parts: ReadonlyArray<'Y' | 'M' | 'D'>
}

export const DATE_FORMATS: ReadonlyArray<DateFormatSpec> = [
  { value: 'YYYYMMDD', label: 'YYYYMMDD', parts: ['Y', 'M', 'D'] },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', parts: ['Y', 'M', 'D'] },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY', parts: ['D', 'M', 'Y'] },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY', parts: ['M', 'D', 'Y'] },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', parts: ['D', 'M', 'Y'] },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', parts: ['M', 'D', 'Y'] },
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD', parts: ['Y', 'M', 'D'] },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY', parts: ['D', 'M', 'Y'] },
  { value: 'YYYY DOY', label: 'YYYY DOY', parts: ['Y', 'D'] },
  { value: 'DOY YYYY', label: 'DOY YYYY', parts: ['D', 'Y'] }
]

export const DATETIME_FORMATS: ReadonlyArray<{
  value: DateTimeFormatKey
  label: string
}> = [
  { value: 'YYYY-MM-DDTHH:MM:SSZ', label: 'YYYY-MM-DDTHH:MM:SSZ' },
  { value: 'YYYY-MM-DDTHH:MM:SS-HH:MM', label: 'YYYY-MM-DDTHH:MM:SS-HH:MM' },
  { value: 'YYYY-MM-DDTHH:MM:SS', label: 'YYYY-MM-DDTHH:MM:SS' },
  // Open-Meteo and several other hourly APIs emit ISO-8601 without seconds.
  { value: 'YYYY-MM-DDTHH:MM', label: 'YYYY-MM-DDTHH:MM' },
  { value: 'YYYYMMDDHH', label: 'YYYYMMDDHH' },
  { value: 'YYYYMMDDHHMM', label: 'YYYYMMDDHHMM' },
  { value: 'YYYY-MM-DD HH:MM', label: 'YYYY-MM-DD HH:MM' },
  { value: 'DD/MM/YYYY HH:MM', label: 'DD/MM/YYYY HH:MM' },
  { value: 'MM/DD/YYYY HH:MM', label: 'MM/DD/YYYY HH:MM' },
  { value: 'DD-MM-YYYY HH:MM', label: 'DD-MM-YYYY HH:MM' },
  { value: 'MM-DD-YYYY HH:MM', label: 'MM-DD-YYYY HH:MM' },
  { value: 'YYYY DOY HH:MM', label: 'YYYY DOY HH:MM' },
  { value: 'DOY YYYY HH:MM', label: 'DOY YYYY HH:MM' }
]

export interface DelimiterSpec {
  value: string
  label: string
}

export const DELIMITERS: ReadonlyArray<DelimiterSpec> = [
  { value: ',', label: 'Comma  (,)' },
  { value: ';', label: 'Semicolon  (;)' },
  { value: '\t', label: 'Tab  (\\t)' },
  { value: '|', label: 'Pipe  (|)' },
  { value: ' ', label: 'Space  ( )' }
]

export interface ImportedDatasetColumn {
  key: string
  label: string
  index: number
}

export interface ImportedDatasetRecord {
  dtIso: string | null
  values: Record<string, string>
}

export interface ImportedDataset {
  filename: string
  columns: ImportedDatasetColumn[]
  records: ImportedDatasetRecord[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const isCommentLine = (l: string): boolean =>
  l.startsWith('#') || l.startsWith('//') || l.startsWith(';;')

// NASA POWER (and several other agency exports) wrap a free-prose preamble in
// explicit -END HEADER- style markers. The prose is not tabular, so letting it
// reach detectDelimiter/detectHeaderLinesToSkip skews both: the sentences make
// space look like the winning delimiter, and the modal column count is computed
// against prose rather than data. Returns the number of leading lines to drop,
// or 0 when no marker is present.
const END_HEADER_RE = /^\s*-+\s*END[ _]HEADER\s*-+\s*$/i

export function detectEndHeaderOffset(text: string): number {
  const lines = text.split(/\r?\n/)
  // Bound the scan so a stray match deep in a large data file can't swallow it.
  const limit = Math.min(lines.length, 200)
  for (let i = 0; i < limit; i++) {
    if (END_HEADER_RE.test(lines[i])) return i + 1
  }
  return 0
}

// The text a detector should look at: everything after an -END HEADER- marker.
const bodyAfterHeaderBlock = (text: string): string => {
  const offset = detectEndHeaderOffset(text)
  return offset === 0 ? text : text.split(/\r?\n/).slice(offset).join('\n')
}

// RFC 4180-aware single-line splitter: a delimiter inside a double-quoted field
// is part of the value, not a column boundary. Two consecutive double quotes
// inside a quoted field decode to a single literal quote. Quote-aware splitting
// is critical for files where fields like "davis, ca" or station lists like
// "KSMF,KEDU,KSAC" naturally contain the comma delimiter.
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === delimiter) {
      cells.push(cur)
      cur = ''
    } else if (ch === '"' && cur.trim() === '') {
      cur = ''
      inQuotes = true
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

function modeOf(arr: number[]): number {
  const m = new Map<number, number>()
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1)
  let best = arr[0]
  let bestCount = 0
  for (const [k, c] of m) {
    if (c > bestCount) {
      best = k
      bestCount = c
    }
  }
  return best
}

// ── Delimiter / header detection ──────────────────────────────────────────────

export function detectDelimiter(text: string): string {
  const lines = bodyAfterHeaderBlock(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !isCommentLine(l))
    .slice(0, 10)
  if (lines.length === 0) return ','

  let bestConsistent: string | null = null
  let bestConsistentAvg = -1
  let bestFallback = ','
  let bestFallbackAvg = -1

  for (const { value: d } of DELIMITERS) {
    const counts = lines.map((l) => splitCsvLine(l, d).length - 1)
    const min = Math.min(...counts)
    const max = Math.max(...counts)
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length
    // Consistency wins over raw count: a real delimiter appears the same number
    // of times in every data row. Noise inside fields varies row-to-row.
    if (min > 0 && min === max && avg > bestConsistentAvg) {
      bestConsistentAvg = avg
      bestConsistent = d
    }
    if (avg > bestFallbackAvg) {
      bestFallbackAvg = avg
      bestFallback = d
    }
  }
  if (bestConsistent) return bestConsistent

  // No delimiter splits every line evenly. Before falling back to raw count,
  // prefer one whose count is at least stable across the DATA rows while the
  // header disagrees — that is the signature of a value containing the
  // delimiter (space-delimited "datetime temperature" whose datetime is
  // "2026-02-03 10:00"). Raw count alone picks space there and silently
  // consumes the header row as data.
  const dataConsistent = DELIMITERS.filter(({ value: d }) => {
    const counts = lines.slice(1).map((l) => splitCsvLine(l, d).length - 1)
    if (counts.length === 0) return false
    return Math.min(...counts) > 0 && Math.min(...counts) === Math.max(...counts)
  })
  if (dataConsistent.length > 0) {
    // Among those, the one the header agrees with most closely wins; ties keep
    // DELIMITERS order (comma first), which is the safer default.
    const headerCount = (d: string): number => splitCsvLine(lines[0], d).length - 1
    const best = dataConsistent.reduce((a, b) => {
      const da = Math.abs(headerCount(a.value) - (splitCsvLine(lines[1], a.value).length - 1))
      const db = Math.abs(headerCount(b.value) - (splitCsvLine(lines[1], b.value).length - 1))
      return db < da ? b : a
    })
    return best.value
  }
  return bestFallback
}

export function detectHeaderLinesToSkip(text: string, delimiter: string): number {
  // An -END HEADER- preamble is skipped wholesale: the prose above it would
  // otherwise dominate the modal column count. The returned figure must stay
  // relative to the same non-empty-line sequence parseDelimited walks, so the
  // preamble is measured after the identical blank-line filter, not on raw
  // line numbers.
  const allNonEmpty = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rawOffset = detectEndHeaderOffset(text)
  const preambleLines =
    rawOffset === 0
      ? 0
      : text
          .split(/\r?\n/)
          .slice(0, rawOffset)
          .map((l) => l.trim())
          .filter(Boolean).length

  const lines = allNonEmpty.slice(preambleLines, preambleLines + 15)
  if (lines.length === 0) return 0

  const counts = lines.map((l) => splitCsvLine(l, delimiter).length)
  const tail = counts.slice(-Math.min(8, counts.length))
  const modal = modeOf(tail)

  let skip = 0
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) {
      skip = i + 1
      continue
    }
    // The first line having FEWER columns than the data, with every data line
    // agreeing, is the signature of a header whose own value count is short
    // because a data value contains the delimiter (space-delimited
    // "datetime temperature" over "2026-02-03 10:00 15.5"). Discarding it would
    // promote real data to the header row and lose a record; keep it and let
    // parseDelimited report the mismatch instead.
    if (i === 0 && counts[0] < modal && counts.slice(1).every((c) => c === modal)) {
      break
    }
    if (counts[i] !== modal) {
      skip = i + 1
      continue
    }
    break
  }
  return preambleLines + skip
}

// ── Delimited parsing ─────────────────────────────────────────────────────────

// Shape tests for the space-delimited date+time rejoin below. Deliberately
// loose — real validation is tryParseDate/tryParseTime at mapping time; these
// only decide whether two adjacent cells were once a single value.
const LOOSE_DATE_RE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$|^\d{8}$/
const LOOSE_TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/

export function parseDelimited(
  text: string,
  delimiter: string,
  headerLinesToSkip: number
): { headers: string[]; rows: string[][] } {
  const all = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (all.length <= headerLinesToSkip) {
    throw new Error('No data rows after skipping header lines.')
  }
  const headers = splitCsvLine(all[headerLinesToSkip], delimiter).map((s) => s.trim())
  const rows: string[][] = []
  for (let i = headerLinesToSkip + 1; i < all.length; i++) {
    let cells = splitCsvLine(all[i], delimiter).map((s) => s.trim())
    // Space-delimited files can carry an unquoted "YYYY-MM-DD HH:MM" value,
    // which splits into two cells and pushes every row one column past the
    // header. When the leading pair is exactly a date followed by a time, and
    // rejoining them squares the row with the header, treat it as the single
    // value it is rather than failing the whole file. Any other mismatch still
    // throws below — this is a targeted repair, not general padding.
    if (
      delimiter === ' ' &&
      cells.length === headers.length + 1 &&
      LOOSE_DATE_RE.test(cells[0]) &&
      LOOSE_TIME_RE.test(cells[1])
    ) {
      cells = [`${cells[0]} ${cells[1]}`, ...cells.slice(2)]
    }
    // Strict: column-count mismatch fails the parse rather than silently
    // padding/truncating, because for weather data a missing field is data loss.
    if (cells.length !== headers.length) {
      throw new Error(
        `Row ${i + 1}: ${cells.length} fields, expected ${headers.length}. ` +
          'The file does not allow header/data column mismatch.'
      )
    }
    rows.push(cells)
  }
  return { headers, rows }
}

// ── XML parsing ───────────────────────────────────────────────────────────────

function sanitizeXmlTagName(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) return name
  return `tag_${Array.from(name)
    .map((ch) => (/^[A-Za-z0-9_.-]$/.test(ch) ? ch : `_x${ch.charCodeAt(0).toString(16)}_`))
    .join('')}`
}

function normalizeXmlForParsing(text: string): { normalized: string; tagNameMap: Map<string, string> } {
  let normalized = text.replace(/<\?xml\s+version\s*=\s*([0-9.]+)\s*\?>/i, '<?xml version="$1"?>')
  const tagNameMap = new Map<string, string>()

  normalized = normalized.replace(/<(\/?)([^\s!?/>]+)([^>]*)>/g, (_match, slash, rawName, rest) => {
    const safeName = sanitizeXmlTagName(rawName)
    tagNameMap.set(safeName, rawName)
    return `<${slash}${safeName}${rest}>`
  })

  return { normalized, tagNameMap }
}

function findXmlRecords(root: Element): Element[] {
  const directChildren = Array.from(root.children)
  if (directChildren.length === 0) return []

  const directCounts: Record<string, number> = {}
  for (const child of directChildren) {
    directCounts[child.tagName] = (directCounts[child.tagName] ?? 0) + 1
  }
  const directRecordTag = Object.entries(directCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (directRecordTag && directCounts[directRecordTag] > 1) {
    return directChildren.filter((child) => child.tagName === directRecordTag)
  }

  let bestNestedRecords: Element[] = []
  for (const child of directChildren) {
    const nestedChildren = Array.from(child.children)
    if (nestedChildren.length === 0) continue

    const nestedCounts: Record<string, number> = {}
    for (const nested of nestedChildren) {
      nestedCounts[nested.tagName] = (nestedCounts[nested.tagName] ?? 0) + 1
    }
    const nestedRecordTag = Object.entries(nestedCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!nestedRecordTag || nestedCounts[nestedRecordTag] <= 1) continue

    const nestedRecords = nestedChildren.filter((nested) => nested.tagName === nestedRecordTag)
    if (nestedRecords.length > bestNestedRecords.length) {
      bestNestedRecords = nestedRecords
    }
  }

  return bestNestedRecords.length > 0 ? bestNestedRecords : directChildren
}

// ── Helios timeseries XML ───────────────────────────────────────────────────
//
// Helios weather exports use a shape the generic record-finder can't handle:
// one or more `<timeseries label="X">` blocks, each holding repeated
// `<datapoint>` rows with `<dateJulian>`, `<time>`, `<value>`. The correct
// table is the PIVOT — each label becomes its own value column, all joined on
// the shared (dateJulian, time) axis — NOT "each <timeseries> is a row", which
// is what findXmlRecords picks for a multi-series file (collapsing every series
// into one useless `datapoint` column so no real data parses).

// Read the trimmed text of the first child whose (real, lower-cased) tag name
// matches `want`. Returns '' when absent.
function heliosChildText(el: Element, realName: (e: Element) => string, want: string): string {
  for (const c of Array.from(el.children)) {
    if (realName(c).toLowerCase() === want) return (c.textContent ?? '').trim()
  }
  return ''
}

// Helios `<time>` is space-separated "H M S" and not always zero-padded
// ("0 0 0" as well as "00 15 00"). Normalize to "HH:MM:SS" so downstream time
// parsing (tryParseTime) accepts it regardless of padding. Left untouched if it
// doesn't look like space-separated integers.
function normalizeHeliosTime(raw: string): string {
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return raw
  const nums = parts.map((p) => parseInt(p, 10))
  if (nums.some((n) => Number.isNaN(n))) return raw
  const [h = 0, m = 0, s = 0] = nums
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Pivot Helios `<timeseries>` blocks into a (dateJulian, time, ...labels) table.
// Returns null if no datapoints are found, so the caller can fall back to the
// generic record finder.
function parseHeliosTimeseries(
  timeseriesEls: Element[],
  realName: (e: Element) => string
): { headers: string[]; rows: string[][] } | null {
  const labels: string[] = []
  const order: string[] = []
  const byKey = new Map<string, { date: string; time: string; values: Record<string, string> }>()

  timeseriesEls.forEach((ts, i) => {
    const base = (ts.getAttribute('label') ?? '').trim() || `series_${i + 1}`
    // Dedupe colliding labels so two series sharing a name don't overwrite.
    let label = base
    let n = 1
    while (labels.includes(label)) label = `${base}_${++n}`
    labels.push(label)

    for (const dp of Array.from(ts.children)) {
      if (realName(dp).toLowerCase() !== 'datapoint') continue
      const date = heliosChildText(dp, realName, 'datejulian')
      const time = normalizeHeliosTime(heliosChildText(dp, realName, 'time'))
      const value = heliosChildText(dp, realName, 'value')
      const key = `${date} ${time}`
      let row = byKey.get(key)
      if (!row) {
        row = { date, time, values: {} }
        byKey.set(key, row)
        order.push(key)
      }
      row.values[label] = value
    }
  })

  if (labels.length === 0 || order.length === 0) return null

  const headers = ['dateJulian', 'time', ...labels]
  const rows = order.map((key) => {
    const r = byKey.get(key) as { date: string; time: string; values: Record<string, string> }
    return [r.date, r.time, ...labels.map((l) => r.values[l] ?? '')]
  })
  return { headers, rows }
}

// ── CIMIS XML ───────────────────────────────────────────────────────────────
//
// CIMIS station exports nest data as `<cimis_data>` → `<station>` → repeated
// `<date val="5/6/2026" hour="0100">` records, each holding measurement child
// elements (<eto>, <air_temp>, <rel_hum>, …). The generic record-finder keeps
// only the measurement children and DROPS the date/hour, because those live in
// the record element's ATTRIBUTES. Pull them out explicitly into date/time
// columns, then add one column per measurement tag.

// Collect every descendant element whose (real, lower-cased) tag name matches
// `want`, without recursing into a matched node.
function collectByName(root: Element, realName: (e: Element) => string, want: string): Element[] {
  const out: Element[] = []
  const walk = (el: Element): void => {
    for (const c of Array.from(el.children)) {
      if (realName(c).toLowerCase() === want) out.push(c)
      else walk(c)
    }
  }
  walk(root)
  return out
}

// CIMIS `hour` is a compact HHMM string ("0100", "2400"). Render as "HH:MM" so
// downstream time parsing accepts it; "24:00" rolls over to the next day there.
function formatCimisHour(raw: string): string {
  const s = raw.trim()
  if (/^\d{1,4}$/.test(s)) {
    const p = s.padStart(4, '0')
    return `${p.slice(0, 2)}:${p.slice(2, 4)}`
  }
  return s
}

// Build a (date, time, ...measurements) table from CIMIS `<date>` records.
// Returns null if there are none, so the caller can fall back.
function parseCimisData(
  dateEls: Element[],
  realName: (e: Element) => string
): { headers: string[]; rows: string[][] } | null {
  const cols: string[] = []
  const records: { date: string; time: string; values: Record<string, string> }[] = []

  for (const d of dateEls) {
    const date = (d.getAttribute('val') ?? '').trim()
    const time = formatCimisHour(d.getAttribute('hour') ?? '')
    const values: Record<string, string> = {}
    for (const c of Array.from(d.children)) {
      const name = realName(c)
      if (!cols.includes(name)) cols.push(name)
      values[name] = (c.textContent ?? '').trim()
    }
    records.push({ date, time, values })
  }

  if (records.length === 0) return null

  const headers = ['date', 'time', ...cols]
  const rows = records.map((r) => [r.date, r.time, ...cols.map((c) => r.values[c] ?? '')])
  return { headers, rows }
}

export function parseXml(text: string): { headers: string[]; rows: string[][] } {
  let doc = new DOMParser().parseFromString(text, 'application/xml')
  let tagNameMap = new Map<string, string>()

  if (doc.querySelector('parsererror')) {
    const normalized = normalizeXmlForParsing(text)
    tagNameMap = normalized.tagNameMap
    doc = new DOMParser().parseFromString(normalized.normalized, 'application/xml')
  }
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML format.')
  const root = doc.documentElement
  if (!root || root.children.length === 0) {
    throw new Error('XML is empty or has no records.')
  }

  const realName = (el: Element): string => tagNameMap.get(el.tagName) ?? el.tagName

  // Helios shape: pivot `<timeseries label>` blocks into one column per label.
  // Handles both `<helios>` wrapping the blocks and a bare top-level
  // `<timeseries>`. Falls through to the generic finder if there's no data.
  const timeseriesEls =
    realName(root).toLowerCase() === 'timeseries'
      ? [root]
      : Array.from(root.children).filter((c) => realName(c).toLowerCase() === 'timeseries')
  if (timeseriesEls.length > 0) {
    const pivoted = parseHeliosTimeseries(timeseriesEls, realName)
    if (pivoted) return pivoted
  }

  // CIMIS shape: pull date/time from `<date val hour>` attributes (which the
  // generic finder drops) and add one column per measurement child. The
  // attribute filter keeps generic `<date>` text nodes from triggering this.
  const cimisDates = collectByName(root, realName, 'date').filter(
    (d) => d.hasAttribute('val') || d.hasAttribute('hour')
  )
  if (cimisDates.length > 0) {
    const parsed = parseCimisData(cimisDates, realName)
    if (parsed) return parsed
  }

  const records = findXmlRecords(root)
  if (records.length === 0) {
    throw new Error('XML is empty or has no records.')
  }

  const headers: string[] = []
  const seen = new Set<string>()
  for (const rec of records) {
    for (const f of Array.from(rec.children)) {
      const rawTagName = tagNameMap.get(f.tagName) ?? f.tagName
      if (!seen.has(rawTagName)) {
        seen.add(rawTagName)
        headers.push(rawTagName)
      }
    }
  }

  const rows = records.map((rec) =>
    headers.map((h) => {
      const el = Array.from(rec.children).find((c) => (tagNameMap.get(c.tagName) ?? c.tagName) === h)
      return el ? (el.textContent ?? '').trim() : ''
    })
  )
  return { headers, rows }
}

// ── Front-door parser ─────────────────────────────────────────────────────────

export interface ParseFileOptions {
  delimiter?: string
  headerLinesToSkip?: number
}

export function parseFile(
  filename: string,
  content: string,
  opts: ParseFileOptions = {}
): ParseResult {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const looksXml = content.trimStart().startsWith('<')
  if (ext === 'xml' || looksXml) {
    const { headers, rows } = parseXml(content)
    return { format: 'xml', delimiter: '', headerLinesToSkip: 0, headers, rows }
  }
  const delimiter = opts.delimiter ?? detectDelimiter(content)
  const headerLinesToSkip = opts.headerLinesToSkip ?? detectHeaderLinesToSkip(content, delimiter)
  const { headers, rows } = parseDelimited(content, delimiter, headerLinesToSkip)
  return {
    format: ext === 'csv' ? 'csv' : 'txt',
    delimiter,
    headerLinesToSkip,
    headers,
    rows
  }
}

// ── Date / time parsing ───────────────────────────────────────────────────────

const DATE_SEP_RE = /[/\-.\s,]+/

interface DateParts {
  Y: number
  M: number
  D: number
}

interface TimeParts {
  H: number
  M: number
  S: number
  rollover: boolean
}

export function tryParseDate(raw: unknown, formatKey: DateFormatKey): DateParts | null {
  if (raw === undefined || raw === null || raw === '') return null
  const fmt = DATE_FORMATS.find((f) => f.value === formatKey)
  if (!fmt) return null
  const trimmed = String(raw).trim()

  if (formatKey === 'YYYYMMDD') {
    const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (!compact) return null
    return validateDateParts({
      Y: parseInt(compact[1], 10),
      M: parseInt(compact[2], 10),
      D: parseInt(compact[3], 10)
    })
  }

  if (formatKey === 'YYYY DOY' || formatKey === 'DOY YYYY') {
    const tokens = trimmed.split(DATE_SEP_RE).filter(Boolean)
    if (tokens.length !== 2) return null
    const yearToken = formatKey === 'YYYY DOY' ? tokens[0] : tokens[1]
    const doyToken = formatKey === 'YYYY DOY' ? tokens[1] : tokens[0]
    if (!/^\d{4}$/.test(yearToken) || !/^\d{1,3}$/.test(doyToken)) return null
    return dateFromDayOfYear(parseInt(yearToken, 10), parseInt(doyToken, 10))
  }

  const tokens = trimmed.split(DATE_SEP_RE).filter(Boolean)
  if (tokens.length !== 3) return null

  let Y = 0
  let M = 0
  let D = 0
  for (let i = 0; i < 3; i++) {
    const tok = tokens[i]
    const v = parseInt(tok, 10)
    if (Number.isNaN(v)) return null
    // Year must be exactly 4 digits in the source — "26" is ambiguous and
    // "0123" is not a real year. Forcing 4 digits keeps imports unambiguous.
    if (fmt.parts[i] === 'Y' && !/^\d{4}$/.test(tok)) return null
    if (fmt.parts[i] === 'Y') Y = v
    else if (fmt.parts[i] === 'M') M = v
    else D = v
  }
  return validateDateParts({ Y, M, D })
}

export function tryParseTime(raw: unknown): TimeParts | null {
  if (raw === undefined || raw === null || raw === '') return null
  const s = String(raw).trim()
  let H: number
  let M: number
  let S = 0

  const digits = s.match(/^\d+$/)
  if (digits) {
    if (s.length <= 2) {
      H = parseInt(s, 10)
      M = 0
    } else if (s.length === 3 || s.length === 4) {
      const split = s.match(/^(\d{1,2})(\d{2})$/)
      if (!split) return null
      H = parseInt(split[1], 10)
      M = parseInt(split[2], 10)
    } else if (s.length === 6) {
      H = parseInt(s.slice(0, 2), 10)
      M = parseInt(s.slice(2, 4), 10)
      S = parseInt(s.slice(4, 6), 10)
    } else {
      return null
    }
  } else {
    const sep = s.match(/^(\d{1,2})(?::|\s+)(\d{2})(?:(?::|\s+)(\d{2}))?$/)
    if (!sep) return null
    H = parseInt(sep[1], 10)
    M = parseInt(sep[2], 10)
    S = sep[3] ? parseInt(sep[3], 10) : 0
  }

  if (Number.isNaN(H) || Number.isNaN(M) || Number.isNaN(S)) return null
  if (H === 24 && M === 0 && S === 0) return { H: 0, M: 0, S: 0, rollover: true }
  if (H < 0 || H > 23 || M < 0 || M > 59 || S < 0 || S > 59) return null
  return { H, M, S, rollover: false }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function validateDateParts(parts: DateParts): DateParts | null {
  const { Y, M, D } = parts
  if (M < 1 || M > 12 || D < 1 || D > 31) return null
  // Build/read in UTC (see buildDate) so validation never depends on the host
  // timezone or its DST gaps.
  const date = new Date(Date.UTC(Y, M - 1, D))
  if (date.getUTCFullYear() !== Y || date.getUTCMonth() !== M - 1 || date.getUTCDate() !== D)
    return null
  return parts
}

function dateFromDayOfYear(Y: number, doy: number): DateParts | null {
  const maxDay = isLeapYear(Y) ? 366 : 365
  if (doy < 1 || doy > maxDay) return null
  const date = new Date(Date.UTC(Y, 0, doy))
  return { Y: date.getUTCFullYear(), M: date.getUTCMonth() + 1, D: date.getUTCDate() }
}

// The imported Year/Month/Day/Hour/Minute are timezone-agnostic wall-clock
// labels. We anchor them in UTC — the same neutral-ruler approach the Add-Row
// path uses (see buildRowsForAdd in ProjectScreen/saga.ts: `Date.UTC(...)`) —
// so the parse → toISOString() → read-back round trip preserves the wall clock
// exactly on every machine. Building in local time made a DST spring-forward
// hour (e.g. 02:00 on 2024-03-10 in US Pacific) collapse onto the next hour,
// which the backend then rejected as a "duplicate date-time".
function buildDate(parts: DateParts, time: TimeParts | null): Date {
  const base = new Date(
    Date.UTC(parts.Y, parts.M - 1, parts.D, time?.H ?? 0, time?.M ?? 0, time?.S ?? 0)
  )
  if (time?.rollover) {
    base.setUTCDate(base.getUTCDate() + 1)
  }
  return base
}

export function tryParseDateTime(raw: unknown, formatKey: DateTimeFormatKey): Date | null {
  if (raw === undefined || raw === null || raw === '') return null
  const s = String(raw).trim()

  if (formatKey === 'YYYY-MM-DDTHH:MM:SSZ') {
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/)
    if (!match) return null
    const date = validateDateParts({
      Y: parseInt(match[1], 10),
      M: parseInt(match[2], 10),
      D: parseInt(match[3], 10)
    })
    if (!date) return null
    const time = tryParseTime(`${match[4]}:${match[5]}:${match[6]}`)
    if (!time) return null
    return buildDate(date, time)
  }

  if (formatKey === 'YYYY-MM-DDTHH:MM:SS-HH:MM') {
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|[+-]\d{2}:\d{2})$/)
    if (!match) return null
    const date = validateDateParts({
      Y: parseInt(match[1], 10),
      M: parseInt(match[2], 10),
      D: parseInt(match[3], 10)
    })
    if (!date) return null
    const time = tryParseTime(`${match[4]}:${match[5]}:${match[6]}`)
    if (!time) return null
    return buildDate(date, time)
  }

  if (formatKey === 'YYYY-MM-DDTHH:MM:SS') {
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/)
    if (!match) return null
    const date = validateDateParts({
      Y: parseInt(match[1], 10),
      M: parseInt(match[2], 10),
      D: parseInt(match[3], 10)
    })
    if (!date) return null
    const time = tryParseTime(`${match[4]}:${match[5]}:${match[6]}`)
    if (!time) return null
    return buildDate(date, time)
  }

  if (formatKey === 'YYYY-MM-DDTHH:MM') {
    // Anchored, and with no optional seconds group, so this stays distinct from
    // the YYYY-MM-DDTHH:MM:SS variants above rather than shadowing them.
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
    if (!match) return null
    const date = validateDateParts({
      Y: parseInt(match[1], 10),
      M: parseInt(match[2], 10),
      D: parseInt(match[3], 10)
    })
    if (!date) return null
    const time = tryParseTime(`${match[4]}:${match[5]}`)
    if (!time) return null
    return buildDate(date, time)
  }

  if (formatKey === 'YYYYMMDDHH' || formatKey === 'YYYYMMDDHHMM') {
    const compact =
      formatKey === 'YYYYMMDDHH'
        ? s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/)
        : s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/)
    if (!compact) return null
    const date = validateDateParts({
      Y: parseInt(compact[1], 10),
      M: parseInt(compact[2], 10),
      D: parseInt(compact[3], 10)
    })
    if (!date) return null
    const time =
      formatKey === 'YYYYMMDDHH'
        ? tryParseTime(compact[4])
        : tryParseTime(`${compact[4]}${compact[5]}`)
    if (!time) return null
    return buildDate(date, time)
  }

  if (formatKey === 'YYYY DOY HH:MM' || formatKey === 'DOY YYYY HH:MM') {
    const tokens = s.split(/\s+/).filter(Boolean)
    if (tokens.length !== 3) return null
    const dateFormat: DateFormatKey = formatKey === 'YYYY DOY HH:MM' ? 'YYYY DOY' : 'DOY YYYY'
    const date = tryParseDate(`${tokens[0]} ${tokens[1]}`, dateFormat)
    const time = tryParseTime(tokens[2])
    if (!date || !time) return null
    return buildDate(date, time)
  }

  const split = s.match(/^(.+?)\s+(.+)$/)
  if (!split) return null

  const dateFormatsByDateTime: Record<DateTimeFormatKey, DateFormatKey | null> = {
    'YYYY-MM-DDTHH:MM:SSZ': null,
    'YYYY-MM-DDTHH:MM:SS-HH:MM': null,
    'YYYY-MM-DDTHH:MM:SS': null,
    'YYYY-MM-DDTHH:MM': null,
    YYYYMMDDHH: null,
    YYYYMMDDHHMM: null,
    'YYYY-MM-DD HH:MM': 'YYYY-MM-DD',
    'DD/MM/YYYY HH:MM': 'DD/MM/YYYY',
    'MM/DD/YYYY HH:MM': 'MM/DD/YYYY',
    'DD-MM-YYYY HH:MM': 'DD-MM-YYYY',
    'MM-DD-YYYY HH:MM': 'MM-DD-YYYY',
    'YYYY DOY HH:MM': null,
    'DOY YYYY HH:MM': null
  }

  const dateFormat = dateFormatsByDateTime[formatKey]
  if (!dateFormat) return null
  const date = tryParseDate(split[1], dateFormat)
  const time = tryParseTime(split[2])
  if (!date || !time) return null
  return buildDate(date, time)
}

// Tagged result so the UI can distinguish "bad date" from "bad time".
//
// Time is OPTIONAL: when a mapped time/hour/minute value can't be parsed we
// surface a `invalid_time` warning to the UI, but we still build a Date with
// time defaulted to 00:00 so the row is importable. Date is REQUIRED and
// strict — `invalid_date` rows have no Date and import as literal "Invalid".
export type RowDateTimeResult =
  | { kind: 'ok'; date: Date }
  | { kind: 'invalid_time'; date: Date }
  | { kind: 'invalid_date' }

export function parseRowDateTime(
  row: string[],
  headers: string[],
  mode: DateTimeMode,
  mapping: DateTimeMapping,
  dateFormat: DateFormatKey,
  datetimeFormat?: DateTimeFormatKey
): RowDateTimeResult {
  const selectionMap: Record<
    DateTimeMode,
    { dateMode: DateSelectionMode; timeMode: TimeSelectionMode }
  > = {
    group1: { dateMode: 'parts', timeMode: 'parts' },
    group2: { dateMode: 'string', timeMode: 'string' },
    group3: { dateMode: 'datetime', timeMode: 'none' }
  }
  const { dateMode, timeMode } = selectionMap[mode]
  return parseRowDateTimeSelections(
    row,
    headers,
    dateMode,
    timeMode,
    mapping,
    dateFormat,
    datetimeFormat
  )
}

export function parseRowDateTimeSelections(
  row: string[],
  headers: string[],
  dateMode: DateSelectionMode,
  timeMode: TimeSelectionMode,
  mapping: DateTimeMapping,
  dateFormat: DateFormatKey,
  datetimeFormat?: DateTimeFormatKey
): RowDateTimeResult {
  const get = (key: keyof DateTimeMapping): string | undefined => {
    const colName = mapping[key]
    if (!colName) return undefined
    const idx = headers.indexOf(colName)
    return idx >= 0 ? row[idx] : undefined
  }

  if (dateMode === 'datetime') {
    const datetimeRaw = get('datetime')
    if (datetimeRaw === undefined || datetimeRaw === '' || !datetimeFormat) {
      return { kind: 'invalid_date' }
    }
    const parsed = tryParseDateTime(datetimeRaw, datetimeFormat)
    return parsed ? { kind: 'ok', date: parsed } : { kind: 'invalid_date' }
  }

  let dateParts: DateParts | null = null

  if (dateMode === 'string') {
    const dateRaw = get('date')
    if (dateRaw === undefined || dateRaw === '') return { kind: 'invalid_date' }
    dateParts = tryParseDate(dateRaw, dateFormat)
  } else if (dateMode === 'julian') {
    const yearRaw = get('julianYear')
    const dayRaw = get('julianDay')
    if (yearRaw === undefined || dayRaw === undefined) return { kind: 'invalid_date' }
    if (!/^\d{4}$/.test(String(yearRaw).trim()) || !/^\d{1,3}$/.test(String(dayRaw).trim())) {
      return { kind: 'invalid_date' }
    }
    dateParts = dateFromDayOfYear(parseInt(yearRaw, 10), parseInt(dayRaw, 10))
  } else {
    const yRaw = get('year')
    const mRaw = get('month')
    const dRaw = get('day')
    if (yRaw === undefined || mRaw === undefined || dRaw === undefined) {
      return { kind: 'invalid_date' }
    }
    if (!/^\d{4}$/.test(String(yRaw).trim())) return { kind: 'invalid_date' }
    const Y = parseInt(yRaw, 10)
    const Mo = parseInt(mRaw, 10)
    const D = parseInt(dRaw, 10)
    if (Number.isNaN(Y) || Number.isNaN(Mo) || Number.isNaN(D)) {
      return { kind: 'invalid_date' }
    }
    if (Mo < 1 || Mo > 12) return { kind: 'invalid_date' }
    if (D < 1 || D > 31) return { kind: 'invalid_date' }
    dateParts = validateDateParts({ Y, M: Mo, D })
  }

  if (!dateParts) return { kind: 'invalid_date' }

  let H = 0
  let Min = 0
  let Sec = 0
  let rollover = false
  let timeInvalid = false

  if (timeMode === 'parts') {
    if (mapping.hour) {
      const hRaw = get('hour')
      if (hRaw === undefined || hRaw === '') {
        timeInvalid = true
      } else {
        // An "Hour" column is not always a bare 0-23 integer: CIMIS writes
        // "0100" and older Helios exports write "1300", both of which mean
        // HHMM. A raw parseInt reads those as 100 and 1300 and rejects them as
        // out-of-range, losing the whole file. tryParseTime already implements
        // exactly this widening (1-2 digits = hour, 3-4 digits = HHMM), so
        // defer to it and take the minute it recovers. A separately mapped
        // Minute column still wins below.
        const t = tryParseTime(hRaw)
        if (!t) {
          timeInvalid = true
        } else {
          H = t.H
          Min = t.M
          Sec = t.S
          rollover = t.rollover
        }
      }
    }
    if (mapping.minute) {
      const mRaw2 = get('minute')
      if (mRaw2 === undefined || mRaw2 === '') {
        timeInvalid = true
      } else {
        const mv = parseInt(mRaw2, 10)
        if (Number.isNaN(mv) || mv < 0 || mv > 59) timeInvalid = true
        else Min = mv
      }
    }
  } else if (timeMode === 'string' || timeMode === 'compact') {
    if (mapping.time) {
      const timeRaw = get('time')
      if (timeRaw === undefined || timeRaw === '') {
        timeInvalid = true
      } else {
        const t = tryParseTime(timeRaw)
        if (!t) {
          timeInvalid = true
        } else {
          H = t.H
          Min = t.M
          Sec = t.S
          rollover = t.rollover
        }
      }
    }
  }

  const date = buildDate(dateParts, { H, M: Min, S: Sec, rollover })
  return timeInvalid ? { kind: 'invalid_time', date } : { kind: 'ok', date }
}

// ── CSV serialization (for backend upload) ────────────────────────────────────

export function toCsv(d: ImportedDataset): string {
  const escape = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

  const headerLine = ['Date-Time', ...d.columns.map((c) => c.label)].map(escape).join(',')
  const lines = [headerLine]
  for (const r of d.records) {
    const dt = r.dtIso ?? 'Invalid'
    const cells = [dt, ...d.columns.map((c) => r.values[c.key] ?? '')]
    lines.push(cells.map(escape).join(','))
  }
  return lines.join('\n')
}
