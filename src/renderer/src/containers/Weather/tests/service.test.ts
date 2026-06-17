import {
  addColumnRequest,
  addColumnsRequest,
  addRowsRequest,
  deleteHeaderRequest,
  deleteRowsRequest,
  getProjectRequest,
  loadDataRequest,
  loadDataTypesRequest,
  loadHeadersRequest,
  normalizeWireCellValue,
  patchHeaderRequest,
  toCellValue,
  updateColumnRequest,
  updateCellRequest
} from '../service'
import { api, ApiError } from 'utils/api'
import { API_ROUTES } from 'utils/constants'

vi.mock('utils/api', async () => {
  const actual = await vi.importActual<typeof import('utils/api')>('utils/api')
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn()
    }
  }
})

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  mockedApi.get.mockReset()
  mockedApi.post.mockReset()
  mockedApi.patch.mockReset()
  mockedApi.delete.mockReset()
})

describe('loadDataTypesRequest', () => {
  it('GETs the catalog route and returns the response', async () => {
    const payload = { data_types: [] }
    mockedApi.get.mockResolvedValueOnce(payload)
    const res = await loadDataTypesRequest()
    expect(mockedApi.get).toHaveBeenCalledWith(API_ROUTES.catalog.dataTypes)
    expect(res).toBe(payload)
  })
})

describe('getProjectRequest', () => {
  it('GETs the project route with the projectId', async () => {
    mockedApi.get.mockResolvedValueOnce({ project: {} })
    await getProjectRequest('p1')
    expect(mockedApi.get).toHaveBeenCalledWith(API_ROUTES.project.get('p1'))
  })
})

describe('loadHeadersRequest', () => {
  it('GETs the scoped headers route', async () => {
    mockedApi.get.mockResolvedValueOnce({ success: true, count: 0, headers: [] })
    await loadHeadersRequest('p1', 's1')
    expect(mockedApi.get).toHaveBeenCalledWith(API_ROUTES.weather.headers('p1', 's1'))
  })
})

describe('loadDataRequest', () => {
  it('GETs the data route', async () => {
    mockedApi.get.mockResolvedValueOnce({
      success: true,
      labels: [],
      row_count: 0,
      total_rows: 0,
      column_count: 0,
      offset: 0,
      limit: null,
      rows: []
    })
    await loadDataRequest('p1', 's1')
    expect(mockedApi.get).toHaveBeenCalledWith(API_ROUTES.weather.data('p1', 's1'))
  })
})

describe('addColumnRequest', () => {
  it('wraps the body in { column: [...] } and maps the wire response', async () => {
    mockedApi.post.mockResolvedValueOnce({
      success: true,
      columns: [{ id: 42, name: 'foo', datatype_id: 1, data_unit_id: 10 }]
    })
    const res = await addColumnRequest('p1', 's1', {
      name: 'foo',
      dataTypeId: 1,
      dataUnitId: 10,
      values: [{ date: '2026-01-01', time: '00:00', value: '1' }]
    })
    expect(mockedApi.post).toHaveBeenCalledWith(API_ROUTES.weather.addCol('p1', 's1'), {
      column: [
        {
          name: 'foo',
          datatype: 1,
          data_unit: 10,
          values: [{ date: '2026-01-01', time: '00:00', value: '1' }]
        }
      ]
    })
    expect(res).toEqual({
      column: { id: '42', name: 'foo', dataTypeId: 1, unitId: 10 }
    })
  })

  it('preserves null dataType / unit ids on the wire', async () => {
    mockedApi.post.mockResolvedValueOnce({
      success: true,
      columns: [{ id: 7, name: 'bar', datatype_id: null, data_unit_id: null }]
    })
    await addColumnRequest('p1', 's1', {
      name: 'bar',
      dataTypeId: null,
      dataUnitId: null,
      values: []
    })
    const [, body] = mockedApi.post.mock.calls[0]
    expect(body).toEqual({
      column: [{ name: 'bar', datatype: null, data_unit: null, values: [] }]
    })
  })

  it('throws ApiError when the server returns no columns', async () => {
    mockedApi.post.mockResolvedValueOnce({ success: true, columns: [] })
    await expect(
      addColumnRequest('p1', 's1', {
        name: 'foo',
        dataTypeId: null,
        dataUnitId: null,
        values: []
      })
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('addColumnsRequest (bulk)', () => {
  it('POSTs all columns in one request and maps each result', async () => {
    mockedApi.post.mockResolvedValueOnce({
      success: true,
      columns: [
        { id: 1, name: 'a', datatype_id: null, data_unit_id: null },
        { id: 2, name: 'b', datatype_id: 5, data_unit_id: 50 }
      ]
    })
    const res = await addColumnsRequest('p1', 's1', [
      { name: 'a', dataTypeId: null, dataUnitId: null, values: [] },
      { name: 'b', dataTypeId: 5, dataUnitId: 50, values: [] }
    ])
    expect(res.columns).toEqual([
      { id: '1', name: 'a', dataTypeId: null, unitId: null },
      { id: '2', name: 'b', dataTypeId: 5, unitId: 50 }
    ])
  })

  it('throws when count of returned columns differs from request', async () => {
    mockedApi.post.mockResolvedValueOnce({ success: true, columns: [] })
    await expect(
      addColumnsRequest('p1', 's1', [{ name: 'a', dataTypeId: null, dataUnitId: null, values: [] }])
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('patchHeaderRequest', () => {
  it('PATCHes the header route with the body', async () => {
    mockedApi.patch.mockResolvedValueOnce('ok')
    await patchHeaderRequest('p1', 's1', 7, { name: 'renamed' })
    expect(mockedApi.patch).toHaveBeenCalledWith(API_ROUTES.weather.headerPatch('p1', 's1', 7), {
      name: 'renamed'
    })
  })
})

describe('deleteHeaderRequest', () => {
  it('DELETEs the header route', async () => {
    const payload = { success: true, header_id: 7 }
    mockedApi.delete.mockResolvedValueOnce(payload)
    const res = await deleteHeaderRequest('p1', 's1', 7)
    expect(mockedApi.delete).toHaveBeenCalledWith(API_ROUTES.weather.headerDelete('p1', 's1', 7))
    expect(res).toBe(payload)
  })
})

describe('updateColumnRequest', () => {
  it('PATCHes updateCol/{columnId} with a body that carries no id', async () => {
    mockedApi.patch.mockResolvedValueOnce('ok')
    await updateColumnRequest('p1', 's1', 15, {
      name: 'check',
      values: [
        { date: '2026-01-01', time: '00:00:00', value: '1' },
        { date: '2026-01-01', time: '01:00:00', value: '1' }
      ]
    })
    expect(mockedApi.patch).toHaveBeenCalledWith(API_ROUTES.weather.updateCol('p1', 's1', 15), {
      name: 'check',
      datatype: null,
      data_unit: null,
      values: [
        { date: '2026-01-01', time: '00:00:00', value: '1' },
        { date: '2026-01-01', time: '01:00:00', value: '1' }
      ]
    })
  })
})

describe('addRowsRequest', () => {
  it('POSTs the rows body to the addRow route', async () => {
    mockedApi.post.mockResolvedValueOnce({ success: true })
    const body = { rows: [{ date: '2026-01-01', time: '00:00' }] }
    await addRowsRequest('p1', 's1', body)
    expect(mockedApi.post).toHaveBeenCalledWith(API_ROUTES.weather.addRow('p1', 's1'), body)
  })
})

describe('deleteRowsRequest', () => {
  it('POSTs the [{ date, time }] keys to the deleteRow route', async () => {
    mockedApi.post.mockResolvedValueOnce('ok')
    const body = [{ date: '2026-01-01', time: '00:00:00' }]
    await deleteRowsRequest('p1', 's1', body)
    expect(mockedApi.post).toHaveBeenCalledWith(API_ROUTES.weather.deleteRow('p1', 's1'), body)
  })
})

describe('updateCellRequest', () => {
  it('PATCHes a single update wrapped in { updates: [...] }', async () => {
    mockedApi.patch.mockResolvedValueOnce({ success: true, updated_count: 1 })
    const body = {
      col: '5',
      row: { date: '2026-01-01', time: '00:00' },
      value: '42'
    }
    await updateCellRequest('p1', 's1', body)
    expect(mockedApi.patch).toHaveBeenCalledWith(API_ROUTES.weather.update('p1', 's1'), {
      updates: [body]
    })
  })
})

describe('toCellValue', () => {
  it('returns null for null', () => {
    expect(toCellValue(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(toCellValue(undefined)).toBeNull()
  })

  it('stringifies finite numbers', () => {
    expect(toCellValue(42)).toBe('42')
    expect(toCellValue(0)).toBe('0')
    expect(toCellValue(-3.14)).toBe('-3.14')
  })

  it('normalizes backend float artifacts to 7 decimals', () => {
    expect(toCellValue(0.009999999776482582)).toBe('0.0099999')
    expect(toCellValue(1.7999999523162842)).toBe('1.7999999')
  })

  it('returns null for non-finite numbers (NaN, Infinity)', () => {
    expect(toCellValue(Number.NaN)).toBeNull()
    expect(toCellValue(Number.POSITIVE_INFINITY)).toBeNull()
    expect(toCellValue(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('returns strings verbatim', () => {
    expect(toCellValue('hello')).toBe('hello')
    expect(toCellValue('')).toBe('')
  })
})

describe('normalizeWireCellValue', () => {
  it('reports when a backend numeric value had to be truncated', () => {
    expect(normalizeWireCellValue(0.009999999776482582)).toEqual({
      value: '0.0099999',
      truncated: true
    })
  })

  it('preserves non-numeric strings without truncation', () => {
    expect(normalizeWireCellValue('hello')).toEqual({
      value: 'hello',
      truncated: false
    })
  })
})
