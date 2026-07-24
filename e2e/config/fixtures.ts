/**
 * Fixture-file access + inline sample CSVs. Replaces the `FIX`/`fixture()` helper
 * and the `CSV`/`IMPORT_CSV` literals that were duplicated across the weather and
 * upload specs.
 */
import { join } from 'node:path'

/** Absolute path to the weather fixtures directory. */
export const FIXTURES_DIR = join(process.cwd(), 'e2e', 'fixtures', 'weather')

/** Absolute path to a named weather fixture file. */
export const fixture = (name: string): string => join(FIXTURES_DIR, name)

/** Real provider fixture filenames (single source of truth). */
export const FIXTURE_FILES = {
  DAVIS: 'davis, ca yesterday.csv',
  AMW_CSV: 'AMW.csv',
  AMW_TSV: 'AMW.tsv',
  NLR1: 'NLR1.csv',
  NLR2: 'NLR2.csv',
  NLR3: 'NLR3.csv',
  CIMIS_XML: 'CIMIS.xml',
  CIMIS_CSV: 'CIMIS.csv',
  USW: 'USW.csv'
} as const

/** Minimal 2-row datetime+temperature CSV used by happy-path import tests. */
export const SAMPLE_CSV = [
  'datetime,temperature',
  '2026-01-01T00:00:00Z,10',
  '2026-01-01T01:00:00Z,11'
].join('\n')
