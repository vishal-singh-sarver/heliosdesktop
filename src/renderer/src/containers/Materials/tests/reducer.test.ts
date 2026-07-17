import * as actions from '../actions'
import materialsReducer, { initialState } from '../reducer'
import type { Material, MaterialGroupDetail } from '../types'

const make = (id: string, name: string): Material => ({
  id,
  name,
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: { colorR: 90, colorG: 200, colorB: 90, textureFile: null },
  createdAt: '2026-06-23T06:41:16Z',
  visible: true
})

describe('materialsReducer', () => {
  it('returns the initial state', () => {
    expect(materialsReducer(undefined, {} as any)).toEqual(initialState)
  })

  it('LIST_MATERIALS_REQUESTED sets loading and clears error', () => {
    const state = { ...initialState, loadError: 'prev' }
    const result = materialsReducer(state, actions.listMaterialsRequested())
    expect(result.loadStatus).toBe('loading')
    expect(result.loadError).toBeNull()
  })

  it('LIST_MATERIALS_SUCCEEDED stores materials in order', () => {
    const result = materialsReducer(
      { ...initialState, loadStatus: 'loading' },
      actions.listMaterialsSucceeded([make('11', 'GMaterial.002'), make('10', 'GMaterial.001')])
    )
    expect(result.loadStatus).toBe('loaded')
    expect(result.order).toEqual(['11', '10'])
    expect(result.byId['11'].name).toBe('GMaterial.002')
  })

  it('LIST_MATERIALS_FAILED records the error', () => {
    const result = materialsReducer(initialState, actions.listMaterialsFailed('bad'))
    expect(result.loadStatus).toBe('error')
    expect(result.loadError).toBe('bad')
  })

  it('CREATE_MATERIAL_SUCCEEDED opens the new empty group with one blank card', () => {
    const result = materialsReducer(
      { ...initialState, createStatus: 'creating' },
      actions.createMaterialSucceeded('12', 'Material.001')
    )
    expect(result.createStatus).toBe('idle')
    expect(result.selectedId).toBe('12')
    expect(result.editDraft).toEqual({
      groupId: '12',
      name: 'Material.001',
      groups: [
        {
          id: 1,
          number: 1,
          typeId: null,
          values: {},
          saved: false,
          saveStatus: 'idle',
          saveError: null
        }
      ],
      nextGroupId: 2
    })
    expect(result.editDraftNonce).toBe(1)
  })

  it('CREATE_MATERIAL_SUCCEEDED appends the row at the bottom without a list refetch', () => {
    const start = materialsReducer(initialState, actions.listMaterialsSucceeded([make('9', 'Old')]))
    const result = materialsReducer(start, actions.createMaterialSucceeded('12', 'Material.001'))
    // Appended to the bottom, straight from the create response (matches Geometry).
    expect(result.order).toEqual(['9', '12'])
    expect(result.byId['12'].name).toBe('Material.001')
  })

  it('CREATE_MATERIAL_SUCCEEDED seeds the cache (a new group is empty, so no GET needed)', () => {
    const result = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
    expect(result.detailsById['12']).toEqual({ id: '12', name: 'Mat', members: [] })
  })

  it('CREATE_MATERIAL_SUCCEEDED marks the new row for the "just created" cue', () => {
    const result = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
    expect(result.lastCreatedId).toBe('12')
  })

  it('CLEAR_CREATE_HIGHLIGHT forgets the cued row once the cue has run', () => {
    const start = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
    expect(materialsReducer(start, actions.clearCreateHighlight()).lastCreatedId).toBeNull()
  })

  it('LIST_MATERIALS_SUCCEEDED forgets a cue left over from an earlier session', () => {
    // The cue's timer can't fire if the list unmounted mid-cue; a reload must not
    // flash a row created long ago.
    const start = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
    const result = materialsReducer(start, actions.listMaterialsSucceeded([make('12', 'Mat')]))
    expect(result.lastCreatedId).toBeNull()
  })

  it('CREATE_MATERIAL_FAILED records the error', () => {
    const result = materialsReducer(initialState, actions.createMaterialFailed('boom'))
    expect(result.createStatus).toBe('error')
    expect(result.createError).toBe('boom')
  })

  it('OPEN_SAVED_MATERIAL_LOADED builds one saved card per member', () => {
    const detail: MaterialGroupDetail = {
      id: '7',
      name: 'Default Stomatal',
      members: [
        { materialTypeId: 6, properties: { air_humidity: '0.5' } },
        { materialTypeId: 1, properties: {} }
      ]
    }
    const result = materialsReducer(initialState, actions.openSavedMaterialLoaded(detail))
    expect(result.editDraft?.groupId).toBe('7')
    expect(result.editDraft?.groups).toHaveLength(2)
    // Every member is already persisted, so its card saves via PATCH.
    expect(result.editDraft?.groups.every((g) => g.saved)).toBe(true)
    expect(result.editDraft?.groups[0].typeId).toBe(6)
    expect(result.editDraft?.groups[0].values).toEqual({ air_humidity: '0.5' })
    expect(result.editDraft?.nextGroupId).toBe(3)
  })

  it('OPEN_SAVED_MATERIAL_LOADED seeds a blank card when the group has no members', () => {
    const detail: MaterialGroupDetail = { id: '7', name: 'Material.001', members: [] }
    const result = materialsReducer(initialState, actions.openSavedMaterialLoaded(detail))
    // Without a card there is no material-type Select to start from, so the form
    // opens with the same blank card +Add Materials gives a new material.
    expect(result.editDraft?.groups).toHaveLength(1)
    expect(result.editDraft?.groups[0]).toMatchObject({
      id: 1,
      number: 1,
      typeId: null,
      saved: false
    })
    expect(result.editDraft?.nextGroupId).toBe(2)
    // The seeded card is client-only — it must not appear as a member in the cache.
    expect(result.detailsById['7'].members).toEqual([])
  })

  describe('unsaved parameter groups survive a material switch', () => {
    const detailA: MaterialGroupDetail = {
      id: '7',
      name: 'A',
      members: [{ materialTypeId: 6, properties: { air_humidity: '0.5' } }]
    }
    const detailB: MaterialGroupDetail = { id: '8', name: 'B', members: [] }

    // Open A (one saved member), add a card, pick a type and type a value into it —
    // then switch to B and back to A.
    const opened = materialsReducer(initialState, actions.openSavedMaterialLoaded(detailA))
    const added = materialsReducer(opened, actions.addParameterGroup())
    const typed = materialsReducer(added, actions.setParameterGroupType(2, 1))
    const filled = materialsReducer(typed, actions.setParameterGroupValue(2, 'emissivity', '0.9'))
    const away = materialsReducer(filled, actions.openSavedMaterialLoaded(detailB))
    const back = materialsReducer(away, actions.openSavedMaterialLoaded(detailA))

    it('stashes the unsaved card when another material takes over the form', () => {
      expect(away.editDraft?.groupId).toBe('8')
      expect(away.unsavedById['7']).toHaveLength(1)
      expect(away.unsavedById['7'][0]).toMatchObject({ typeId: 1, values: { emissivity: '0.9' } })
    })

    it('restores it — with its type and values — after the saved members', () => {
      expect(back.editDraft?.groups).toHaveLength(2)
      expect(back.editDraft?.groups[0]).toMatchObject({ typeId: 6, saved: true })
      expect(back.editDraft?.groups[1]).toMatchObject({
        number: 2,
        typeId: 1,
        values: { emissivity: '0.9' },
        saved: false
      })
      expect(back.editDraft?.nextGroupId).toBe(3)
    })

    it('keeps it out of the cached detail (the backend has no such member)', () => {
      expect(back.detailsById['7'].members).toEqual(detailA.members)
    })

    it('CLOSE_MATERIAL_DRAFT stashes rather than discards', () => {
      const closed = materialsReducer(filled, actions.closeMaterialDraft())
      expect(closed.editDraft).toBeNull()
      expect(closed.unsavedById['7']).toHaveLength(1)
    })

    it('drops a stashed card whose material type was saved in the meantime', () => {
      // A came back from the backend with the stashed card's type (1) now a member.
      const withMember: MaterialGroupDetail = {
        id: '7',
        name: 'A',
        members: [...detailA.members, { materialTypeId: 1, properties: { emissivity: '0.9' } }]
      }
      const result = materialsReducer(away, actions.openSavedMaterialLoaded(withMember))
      // Two saved cards, and no duplicate of type 1 — a type can only be in the
      // group once.
      expect(result.editDraft?.groups).toHaveLength(2)
      expect(result.editDraft?.groups.every((g) => g.saved)).toBe(true)
    })

    it('REMOVE_MATERIAL discards the stash (there is nothing to come back to)', () => {
      const result = materialsReducer(away, actions.removeMaterial('7'))
      expect(result.unsavedById['7']).toBeUndefined()
    })
  })

  describe('group-detail cache', () => {
    const detail: MaterialGroupDetail = {
      id: '7',
      name: 'Default Stomatal',
      members: [{ materialTypeId: 6, properties: { air_humidity: '0.5' } }]
    }
    const cached = materialsReducer(initialState, actions.openSavedMaterialLoaded(detail))

    it('OPEN_SAVED_MATERIAL_LOADED caches the detail (so a re-click skips the GET)', () => {
      expect(cached.detailsById['7']).toEqual(detail)
    })

    it('LIST_MATERIALS_SUCCEEDED invalidates the cache (a refresh refetches)', () => {
      const result = materialsReducer(cached, actions.listMaterialsSucceeded([make('7', 'X')]))
      expect(result.detailsById).toEqual({})
    })

    it('REMOVE_MATERIAL drops that material from the cache', () => {
      const result = materialsReducer(cached, actions.removeMaterial('7'))
      expect(result.detailsById['7']).toBeUndefined()
    })

    it('saving a parameter group REFRESHES the cache with the saved values (no refetch)', () => {
      // A material open with one card, already saved, holding an edited value.
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 6))
      const edited = materialsReducer(
        typed,
        actions.setParameterGroupValue(1, 'air_humidity', '0.9')
      )
      const result = materialsReducer(edited, actions.saveParameterGroupSucceeded(1))

      // The cache now holds what we just persisted — so re-opening shows 0.9
      // without another GET (this is the "your edit disappears" bug, prevented).
      expect(result.detailsById['12']).toEqual({
        id: '12',
        name: 'Mat',
        members: [{ materialTypeId: 6, properties: { air_humidity: '0.9' } }]
      })
    })

    it('removing a parameter group rewrites the cache without that member', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 6))
      const saved = materialsReducer(typed, actions.saveParameterGroupSucceeded(1))
      expect(saved.detailsById['12'].members).toHaveLength(1)

      const result = materialsReducer(saved, actions.removeParameterGroup(1))
      // The removed member is gone from the cache — it can't "come back".
      expect(result.detailsById['12'].members).toEqual([])
    })

    it('UPLOAD_TEXTURE_SUCCEEDED switches the card to texture mode and clears colour', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 7))
      // The card had a colour before the user switched to texture and uploaded.
      const coloured = materialsReducer(typed, actions.setParameterGroupValue(1, 'color_r', '128'))
      const result = materialsReducer(
        coloured,
        actions.uploadTextureSucceeded(1, 'uploads/materials/12/grass.png')
      )

      const card = result.editDraft?.groups[0]
      expect(card?.saved).toBe(true)
      expect(card?.saveStatus).toBe('idle')
      expect(card?.values.texture_file).toBe('uploads/materials/12/grass.png')
      expect(card?.values.texture_toggle).toBe('true')
      // Colour is cleared — the member is now texture-only.
      expect(card?.values.color_r).toBe('')
    })

    it('RENAME_MATERIAL_SUCCEEDED keeps the cache but updates the name', () => {
      const result = materialsReducer(cached, actions.renameMaterialSucceeded('7', 'Renamed'))
      expect(result.detailsById['7'].name).toBe('Renamed')
      expect(result.detailsById['7'].members).toEqual(detail.members)
    })
  })

  it('REMOVE_MATERIAL drops the material, clears selection and closes its form', () => {
    const start = materialsReducer(
      initialState,
      actions.listMaterialsSucceeded([make('11', 'A'), make('10', 'B')])
    )
    const opened = materialsReducer(start, actions.createMaterialSucceeded('11', 'A'))
    const result = materialsReducer(opened, actions.removeMaterial('11'))
    expect(result.order).toEqual(['10'])
    expect(result.byId['11']).toBeUndefined()
    expect(result.selectedId).toBeNull()
    expect(result.editDraft).toBeNull()
  })

  it('RENAME_MATERIAL_SUCCEEDED updates the name and clears its error', () => {
    const start = materialsReducer(
      { ...initialState, nameErrors: { '11': 'Material name already exists' } },
      actions.listMaterialsSucceeded([make('11', 'A')])
    )
    const result = materialsReducer(start, actions.renameMaterialSucceeded('11', 'B'))
    expect(result.byId['11'].name).toBe('B')
    expect(result.nameErrors['11']).toBeUndefined()
  })

  it('RENAME_MATERIAL_FAILED records a per-id name error', () => {
    const result = materialsReducer(
      initialState,
      actions.renameMaterialFailed('11', 'Material name already exists')
    )
    expect(result.nameErrors['11']).toBe('Material name already exists')
  })

  it('SET_NAME_ERROR clears the error when passed null', () => {
    const start = materialsReducer(initialState, actions.renameMaterialFailed('11', 'boom'))
    const result = materialsReducer(start, actions.setNameError('11', null))
    expect(result.nameErrors['11']).toBeUndefined()
  })

  it('TOGGLE_MATERIAL_VISIBILITY flips the visible flag', () => {
    const start = materialsReducer(initialState, actions.listMaterialsSucceeded([make('11', 'A')]))
    const result = materialsReducer(start, actions.toggleMaterialVisibility('11'))
    expect(result.byId['11'].visible).toBe(false)
  })

  it('SET_SEARCH_QUERY stores the query', () => {
    expect(materialsReducer(initialState, actions.setSearchQuery('foo')).searchQuery).toBe('foo')
  })

  describe('parameter-group cards', () => {
    // A draft with a single blank card (as +Add Materials leaves it).
    const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))

    it('ADD_PARAMETER_GROUP appends another blank card', () => {
      const result = materialsReducer(opened, actions.addParameterGroup())
      expect(result.editDraft?.groups).toHaveLength(2)
      expect(result.editDraft?.groups[1]).toMatchObject({
        id: 2,
        number: 2,
        typeId: null,
        saved: false
      })
    })

    it('SET_PARAMETER_GROUP_TYPE sets the type and clears stale values', () => {
      const withValue = materialsReducer(opened, actions.setParameterGroupValue(1, 'old_prop', '5'))
      const result = materialsReducer(withValue, actions.setParameterGroupType(1, 2))
      expect(result.editDraft?.groups[0].typeId).toBe(2)
      expect(result.editDraft?.groups[0].values).toEqual({})
    })

    it('SET_PARAMETER_GROUP_VALUE writes into that card only', () => {
      const twoCards = materialsReducer(opened, actions.addParameterGroup())
      const result = materialsReducer(
        twoCards,
        actions.setParameterGroupValue(1, 'reflectivity', '0.4')
      )
      expect(result.editDraft?.groups[0].values).toEqual({ reflectivity: '0.4' })
      expect(result.editDraft?.groups[1].values).toEqual({})
    })

    it('SAVE_PARAMETER_GROUP_SUCCEEDED marks the card saved (so it PATCHes next)', () => {
      const saving = materialsReducer(
        opened,
        actions.saveParameterGroupRequested({
          groupId: '12',
          cardId: 1,
          materialTypeId: 1,
          properties: {},
          saved: false,
          scenarioId: null
        })
      )
      expect(saving.editDraft?.groups[0].saveStatus).toBe('saving')
      const result = materialsReducer(saving, actions.saveParameterGroupSucceeded(1))
      expect(result.editDraft?.groups[0].saved).toBe(true)
      expect(result.editDraft?.groups[0].saveStatus).toBe('idle')
    })

    it('SAVE_PARAMETER_GROUP_FAILED records the error on that card', () => {
      const result = materialsReducer(opened, actions.saveParameterGroupFailed(1, 'boom'))
      expect(result.editDraft?.groups[0].saveStatus).toBe('error')
      expect(result.editDraft?.groups[0].saveError).toBe('boom')
    })

    it('REMOVE_PARAMETER_GROUP drops the card', () => {
      const twoCards = materialsReducer(opened, actions.addParameterGroup())
      const result = materialsReducer(twoCards, actions.removeParameterGroup(1))
      expect(result.editDraft?.groups.map((g) => g.id)).toEqual([2])
    })
  })

  it('does not mutate the original state', () => {
    materialsReducer(initialState, actions.listMaterialsSucceeded([make('9', 'Grass')]))
    expect(initialState.order).toHaveLength(0)
  })
})
