import { describe, it, expect, afterEach, vi } from 'vitest'
import { API_ROUTES } from '../utils/constants'

// Fixed ids used across the URL-builder assertions.
const PID = 'proj-42'
const SID = 'scen-7'
const HEADER_ID = 13
const COLUMN_ID = 5

describe('API_ROUTES', () => {
  describe('project routes', () => {
    it('exposes the static create/recent paths', () => {
      expect(API_ROUTES.project.create).toBe('/api/project/create')
      expect(API_ROUTES.project.recent).toBe('/api/project/recent')
    })

    it('builds delete / update / get by project id', () => {
      expect(API_ROUTES.project.delete(PID)).toBe('/api/project/proj-42')
      expect(API_ROUTES.project.update(PID)).toBe('/api/project/proj-42')
      expect(API_ROUTES.project.get(PID)).toBe('/api/project/proj-42')
    })
  })

  describe('weather routes (scoped by project + scenario)', () => {
    it('builds the headers list path', () => {
      expect(API_ROUTES.weather.headers(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/weather_data_header'
      )
    })

    it('builds the per-header patch/delete paths including the header id', () => {
      expect(API_ROUTES.weather.headerPatch(PID, SID, HEADER_ID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/weather_data_header/13'
      )
      expect(API_ROUTES.weather.headerDelete(PID, SID, HEADER_ID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/weather_data_header/13'
      )
    })

    it('builds the time-series data + update paths', () => {
      expect(API_ROUTES.weather.data(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/getAllTimeSeriesData'
      )
      expect(API_ROUTES.weather.update(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/update'
      )
    })

    it('builds the per-column update path with the column id in the URL', () => {
      expect(API_ROUTES.weather.updateCol(PID, SID, COLUMN_ID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/updateCol/5'
      )
    })

    it('builds the add / addCol / addRow paths', () => {
      expect(API_ROUTES.weather.add(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/add'
      )
      expect(API_ROUTES.weather.addCol(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/addCol'
      )
      expect(API_ROUTES.weather.addRow(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/addRow'
      )
    })

    it('builds the deleteRow / delete paths', () => {
      expect(API_ROUTES.weather.deleteRow(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/deleteRow'
      )
      expect(API_ROUTES.weather.delete(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/delete'
      )
    })

    it('builds the uploadFile / clearData paths', () => {
      expect(API_ROUTES.weather.uploadFile(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/uploadfile'
      )
      expect(API_ROUTES.weather.clearData(PID, SID)).toBe(
        '/api/weather/project/proj-42/scenario/scen-7/clear_data'
      )
    })
  })

  describe('catalog routes', () => {
    it('exposes the static data-types path', () => {
      expect(API_ROUTES.catalog.dataTypes).toBe('/api/data-types/')
    })
  })
})

// ── BASE_URL resolution ───────────────────────────────────────────────────────
//
// BASE_URL is computed once at module load, so each branch needs a fresh
// module evaluation with the relevant globals/env in place.
describe('BASE_URL', () => {
  const w = window as unknown as { __APP_BASE_URL__?: string }

  afterEach(() => {
    delete w.__APP_BASE_URL__
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('prefers an injected window.__APP_BASE_URL__ when present', async () => {
    w.__APP_BASE_URL__ = 'http://injected.example:9000'
    vi.resetModules()
    const mod = await import('../utils/constants')
    expect(mod.BASE_URL).toBe('http://injected.example:9000')
  })

  it("uses an empty same-origin base in dev when nothing is injected", async () => {
    delete w.__APP_BASE_URL__
    vi.stubEnv('DEV', true)
    vi.resetModules()
    const mod = await import('../utils/constants')
    expect(mod.BASE_URL).toBe('')
  })

  it('uses the configured backend url outside dev when nothing is injected', async () => {
    delete w.__APP_BASE_URL__
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_BACKEND_URL', 'http://backend.prod:8000')
    vi.resetModules()
    const mod = await import('../utils/constants')
    expect(mod.BASE_URL).toBe('http://backend.prod:8000')
  })
})
