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

// ── Materials ────────────────────────────────────────────────────────────────
//
// Kept in their OWN directory rather than alongside the weather CSVs: these are
// spectral libraries and a texture image, and nothing about them is weather data.
// Until these landed there was no image and no valid spectral file on disk at all,
// so every upload test had to build its file inline as a string — which is why the
// suite could only ever test REJECTED uploads.

/** Absolute path to the materials fixtures directory. */
export const MATERIAL_FIXTURES_DIR = join(process.cwd(), 'e2e', 'fixtures', 'materials')

/** Absolute path to a named materials fixture file. */
export const materialFixture = (name: string): string => join(MATERIAL_FIXTURES_DIR, name)

/**
 * Materials fixture filenames (single source of truth).
 *
 *  - VINEYARD_SPECTRA — a genuine Helios spectral library: <helios> root, five
 *    <globaldata_vec2> blocks as DIRECT children, tab-separated wavelength/value
 *    pairs. The happy path.
 *  - N42_SPECTRUM — an ANSI/IEEE N42.42 radiation-measurement file. Well-formed
 *    XML with an .xml name, so it clears every file-level gate and then fails on
 *    the ROOT check (<RadInstrumentData>, no <helios>). A real third-party file
 *    rather than a hand-built string.
 *  - TEXTURE_PNG — a real 1323x1007 PNG, inside every limit in validateTextureFile.
 */
export const MATERIAL_FIXTURE_FILES = {
  VINEYARD_SPECTRA: 'vineyard_spectra.xml',
  N42_SPECTRUM: 'radiation_spectrum.n42.xml',
  TEXTURE_PNG: 'test_e2e.png'
} as const

/**
 * The five spectra inside VINEYARD_SPECTRA, in the file's own order.
 *
 * Compare as a SET, not a sequence: these come back from the backend via
 * GET .../spectral/labels, and nothing documents that it preserves document
 * order. Asserting the order would be pinning an incidental behaviour of the
 * server rather than the contents of the file.
 */
export const VINEYARD_SPECTRUM_LABELS = [
  'grape_leaf',
  'grape_leaf_transmissivity',
  'grape_berry',
  'grape_bark',
  'vineyard_soil'
] as const
