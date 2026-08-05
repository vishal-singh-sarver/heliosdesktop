import * as actions from '../actions'
import materialsReducer, { initialState } from '../reducer'
import type { Material, MaterialGroupDetail } from '../types'

const make = (id: string, name: string): Material => ({
  id,
  name,
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: { colorR: 90, colorG: 200, colorB: 90, textureFile: null },
  createdAt: '2026-06-23T06:41:16Z'
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
      nameError: null,
      groups: [
        {
          id: 1,
          number: 1,
          typeId: null,
          values: {},
          // Never saved — nothing to compare against, so Save opens as soon as
          // the card is complete.
          savedValues: null,
          saved: false,
          saveStatus: 'idle',
          saveError: null,
          deleteStatus: 'idle',
          uploadStatus: 'idle',
          uploadError: null
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

  it('MATERIAL_DETAIL_LOADED caches the detail without opening the editor form', () => {
    const detail: MaterialGroupDetail = {
      id: '7',
      name: 'Grass',
      members: [{ materialTypeId: 1, properties: { reflectivity: '0.3' } }]
    }
    const result = materialsReducer(initialState, actions.materialDetailLoaded(detail))
    expect(result.detailsById['7']).toEqual(detail)
    // Cache-only: the read-only popup uses this, so the editor form stays closed.
    expect(result.editDraft).toBeNull()
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

  // A card is only kept once its own Save persists it. Unsaved work — a new card
  // being filled in, or edits to a saved card — is discarded the moment another
  // material (or a close) replaces the form; reopening rebuilds purely from what
  // the backend holds.
  describe('unsaved parameter groups are discarded on a material switch', () => {
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

    it('reopens A with ONLY its saved member — the new card is gone', () => {
      expect(back.editDraft?.groups).toHaveLength(1)
      expect(back.editDraft?.groups[0]).toMatchObject({ typeId: 6, saved: true })
      expect(back.editDraft?.nextGroupId).toBe(2)
    })

    it('discards an unsaved card on CLOSE_MATERIAL_DRAFT too', () => {
      const closed = materialsReducer(filled, actions.closeMaterialDraft())
      expect(closed.editDraft).toBeNull()
      const reopened = materialsReducer(closed, actions.openSavedMaterialLoaded(detailA))
      expect(reopened.editDraft?.groups).toHaveLength(1)
    })

    it('discards unsaved EDITS to a saved card on switch', () => {
      const edited = materialsReducer(
        opened,
        actions.setParameterGroupValue(1, 'air_humidity', '0.9')
      )
      const switched = materialsReducer(edited, actions.openSavedMaterialLoaded(detailB))
      const returned = materialsReducer(switched, actions.openSavedMaterialLoaded(detailA))
      // The stored 0.5 is restored, not the un-saved 0.9.
      expect(returned.editDraft?.groups[0].values.air_humidity).toBe('0.5')
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
      const result = materialsReducer(edited, actions.saveParameterGroupSucceeded('12', 1))

      // The cache now holds what we just persisted — so re-opening shows 0.9
      // without another GET (this is the "your edit disappears" bug, prevented).
      expect(result.detailsById['12']).toEqual({
        id: '12',
        name: 'Mat',
        members: [{ materialTypeId: 6, properties: { air_humidity: '0.9' } }]
      })
    })

    it('saving a Radiation card in SPECTRAL mode erases the band values from the cache', () => {
      // Spectral on (use_radiation_bands=false) with a file staged, but a stale
      // band value still in the draft — saving must drop the superseded bands so a
      // reopen shows only the file.
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 6))
      const s1 = materialsReducer(
        typed,
        actions.setParameterGroupValue(1, 'use_radiation_bands', 'false')
      )
      const s2 = materialsReducer(
        s1,
        actions.setParameterGroupValue(1, 'spectral_data', 'uploads/groups/12/leaf.xml')
      )
      const s3 = materialsReducer(s2, actions.setParameterGroupValue(1, 'transmissivity_PAR', '0.3'))
      const result = materialsReducer(s3, actions.saveParameterGroupSucceeded('12', 1))

      const props = result.detailsById['12'].members[0].properties
      expect(props.spectral_data).toBe('uploads/groups/12/leaf.xml')
      expect(props.use_radiation_bands).toBe('false')
      expect(props.transmissivity_PAR).toBeUndefined()
    })

    it('saving a Radiation card in MANUAL mode erases the spectral file from the cache', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 6))
      const s1 = materialsReducer(
        typed,
        actions.setParameterGroupValue(1, 'use_radiation_bands', 'true')
      )
      const s2 = materialsReducer(s1, actions.setParameterGroupValue(1, 'transmissivity_PAR', '0.3'))
      const s3 = materialsReducer(
        s2,
        actions.setParameterGroupValue(1, 'spectral_data', 'uploads/groups/12/leaf.xml')
      )
      const result = materialsReducer(s3, actions.saveParameterGroupSucceeded('12', 1))

      const props = result.detailsById['12'].members[0].properties
      expect(props.transmissivity_PAR).toBe('0.3')
      expect(props.use_radiation_bands).toBe('true')
      expect(props.spectral_data).toBeUndefined()
    })

    it('removing a parameter group rewrites the cache without that member', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 6))
      const saved = materialsReducer(typed, actions.saveParameterGroupSucceeded('12', 1))
      expect(saved.detailsById['12'].members).toHaveLength(1)

      const result = materialsReducer(saved, actions.removeParameterGroup('12', 1))
      // The removed member is gone from the cache — it can't "come back".
      expect(result.detailsById['12'].members).toEqual([])
    })

    it('UPLOAD_TEXTURE_SUCCEEDED stages the path + texture mode but leaves the card UNSAVED', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 7))
      const result = materialsReducer(
        typed,
        actions.uploadTextureSucceeded('12', 1, 'uploads/materials/12/grass.png')
      )

      const card = result.editDraft?.groups[0]
      // Upload now only STORES the file — the member is written by Save. So the
      // path + texture mode are staged, but the card stays unsaved and dirty
      // (no savedValues snapshot) so Save is offered and creates the member.
      expect(card?.values.texture_file).toBe('uploads/materials/12/grass.png')
      expect(card?.values.texture_toggle).toBe('true')
      expect(card?.uploadStatus).toBe('idle')
      expect(card?.saved).toBe(false)
      expect(card?.savedValues).toBeNull()
    })

    it('UPLOAD_TEXTURE_SUCCEEDED for a non-texture property just stages the path', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 1))
      const result = materialsReducer(
        typed,
        actions.uploadTextureSucceeded('12', 1, 'uploads/materials/12/leaf.xml', 'spectral_data')
      )
      const card = result.editDraft?.groups[0]
      expect(card?.values.spectral_data).toBe('uploads/materials/12/leaf.xml')
      // No texture side-effects, and — like the texture upload — no save.
      expect(card?.values.texture_toggle).toBeUndefined()
      expect(card?.uploadStatus).toBe('idle')
      expect(card?.saved).toBe(false)
      expect(card?.savedValues).toBeNull()
    })

    // A failed upload (e.g. a texture 404) left its error pinned under the card;
    // switching the card's type or editing a field must clear it, exactly like a
    // failed save's error does.
    it('clears a stale upload error when the material type changes', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 7))
      const failed = materialsReducer(typed, actions.uploadTextureFailed('12', 1, 'boom'))
      expect(failed.editDraft?.groups[0].uploadError).toBe('boom')

      const switched = materialsReducer(failed, actions.setParameterGroupType(1, 1))
      expect(switched.editDraft?.groups[0].uploadStatus).toBe('idle')
      expect(switched.editDraft?.groups[0].uploadError).toBeNull()
    })

    it('clears a stale upload error when a field is edited', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 1))
      const failed = materialsReducer(typed, actions.uploadTextureFailed('12', 1, 'boom'))
      const edited = materialsReducer(failed, actions.setParameterGroupValue(1, 'emissivity', '0.9'))
      expect(edited.editDraft?.groups[0].uploadStatus).toBe('idle')
      expect(edited.editDraft?.groups[0].uploadError).toBeNull()
    })

    // The cache stands in for a GET (openSavedMaterialWorker serves from it and
    // skips the network), so it must hold what the BACKEND confirmed. Saving one
    // card used to cache every saved card's live draft values — so a sibling card
    // edited but never saved had its pending edits cached as if stored, and
    // re-opening the material showed them as clean and saved.
    it('saving one card does NOT cache a sibling card’s unsaved edits', () => {
      // Two saved cards: card 1 (air_humidity 0.5) and card 2 (air_humidity 0.2).
      const opened = materialsReducer(
        initialState,
        actions.openSavedMaterialLoaded({
          id: '12',
          name: 'Mat',
          members: [
            { materialTypeId: 6, properties: { air_humidity: '0.5' } },
            { materialTypeId: 9, properties: { air_humidity: '0.2' } }
          ]
        })
      )
      // The user edits card 2 and does NOT save it...
      const dirty = materialsReducer(
        opened,
        actions.setParameterGroupValue(2, 'air_humidity', '0.9')
      )
      // ...then saves card 1 instead.
      const result = materialsReducer(dirty, actions.saveParameterGroupSucceeded('12', 1))

      // Card 2 still shows the edit on screen, and still reads as dirty.
      expect(result.editDraft?.groups[1].values.air_humidity).toBe('0.9')
      expect(result.editDraft?.groups[1].savedValues?.air_humidity).toBe('0.2')
      // But the cache — the stand-in for the backend — keeps the STORED 0.2.
      expect(result.detailsById['12'].members[1].properties.air_humidity).toBe('0.2')
    })

    it('RENAME_MATERIAL_SUCCEEDED keeps the cache but updates the name', () => {
      const result = materialsReducer(cached, actions.renameMaterialSucceeded('7', 'Renamed'))
      expect(result.detailsById['7'].name).toBe('Renamed')
      expect(result.detailsById['7'].members).toEqual(detail.members)
    })
  })

  // A row click that misses the cache sets openingId so the right panel can show a
  // spinner while the GET is in flight; the terminal states clear it.
  describe('open-material loading state', () => {
    it('OPEN_SAVED_MATERIAL_REQUESTED marks the material as opening', () => {
      const result = materialsReducer(initialState, actions.openSavedMaterialRequested('7'))
      expect(result.openingId).toBe('7')
    })

    it('OPEN_SAVED_MATERIAL_LOADED clears it', () => {
      const opening = materialsReducer(initialState, actions.openSavedMaterialRequested('7'))
      const result = materialsReducer(
        opening,
        actions.openSavedMaterialLoaded({ id: '7', name: 'A', members: [] })
      )
      expect(result.openingId).toBeNull()
    })

    it('OPEN_SAVED_MATERIAL_FAILED clears it and surfaces the error', () => {
      const opening = materialsReducer(initialState, actions.openSavedMaterialRequested('7'))
      const result = materialsReducer(opening, actions.openSavedMaterialFailed('7', 'boom'))
      expect(result.openingId).toBeNull()
      expect(result.actionError).toBe('boom')
    })

    it('is abandoned when the material is removed or the list reloads', () => {
      const opening = materialsReducer(initialState, actions.openSavedMaterialRequested('7'))
      expect(materialsReducer(opening, actions.removeMaterial('7')).openingId).toBeNull()
      expect(
        materialsReducer(opening, actions.listMaterialsSucceeded([make('7', 'A')])).openingId
      ).toBeNull()
    })
  })

  // The whole-material delete is pessimistic (row stays until success), so the
  // trash must lock while it's in flight or a second confirm fires a duplicate
  // DELETE that 404s on the already-gone material.
  describe('whole-material delete in flight', () => {
    const listed = materialsReducer(
      initialState,
      actions.listMaterialsSucceeded([make('11', 'A')])
    )

    it('DELETE_MATERIAL_REQUESTED marks the id as deleting', () => {
      const result = materialsReducer(listed, actions.deleteMaterialRequested('11', null))
      expect(result.deletingIds).toContain('11')
    })

    it('does not double-add on a repeat request', () => {
      const once = materialsReducer(listed, actions.deleteMaterialRequested('11', null))
      const twice = materialsReducer(once, actions.deleteMaterialRequested('11', null))
      expect(twice.deletingIds).toEqual(['11'])
    })

    it('REMOVE_MATERIAL clears the deleting mark (delete landed)', () => {
      const deleting = materialsReducer(listed, actions.deleteMaterialRequested('11', null))
      const result = materialsReducer(deleting, actions.removeMaterial('11'))
      expect(result.deletingIds).not.toContain('11')
    })

    it('DELETE_MATERIAL_FAILED clears the mark so the delete can be retried', () => {
      const deleting = materialsReducer(listed, actions.deleteMaterialRequested('11', null))
      const result = materialsReducer(deleting, actions.deleteMaterialFailed('11', 'in use'))
      expect(result.deletingIds).not.toContain('11')
      // The error is NOT put on the slice — the saga's toast reports it, so the
      // raw backend text never lands above the list.
      expect(result.actionError).toBeNull()
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

  // A rejection for the material open in the form belongs under the form's name
  // field — the left row still shows the committed (valid) old name, so an error
  // beneath THAT would point at a name the backend never refused.
  describe('RENAME_MATERIAL_FAILED routing', () => {
    const open = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))

    it('goes to the draft when the form holds that material', () => {
      const result = materialsReducer(open, actions.renameMaterialFailed('12', 'boom'))
      expect(result.editDraft?.nameError).toBe('boom')
      expect(result.nameErrors['12']).toBeUndefined()
    })

    it('goes to the row when the form holds a different material', () => {
      const result = materialsReducer(open, actions.renameMaterialFailed('37', 'boom'))
      expect(result.nameErrors['37']).toBe('boom')
      expect(result.editDraft?.nameError).toBeNull()
    })

    it('is cleared by editing the draft name, and by a rename that lands', () => {
      const failed = materialsReducer(open, actions.renameMaterialFailed('12', 'boom'))
      expect(materialsReducer(failed, actions.setMaterialDraftName('X')).editDraft?.nameError).toBe(
        null
      )
      expect(
        materialsReducer(failed, actions.renameMaterialSucceeded('12', 'X')).editDraft?.nameError
      ).toBeNull()
    })
  })

  it('SET_NAME_ERROR clears the error when passed null', () => {
    const start = materialsReducer(initialState, actions.renameMaterialFailed('11', 'boom'))
    const result = materialsReducer(start, actions.setNameError('11', null))
    expect(result.nameErrors['11']).toBeUndefined()
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
      const result = materialsReducer(saving, actions.saveParameterGroupSucceeded('12', 1))
      expect(result.editDraft?.groups[0].saved).toBe(true)
      expect(result.editDraft?.groups[0].saveStatus).toBe('idle')
    })

    it('SAVE_PARAMETER_GROUP_FAILED records the error on that card', () => {
      const result = materialsReducer(opened, actions.saveParameterGroupFailed('12', 1, 'boom'))
      expect(result.editDraft?.groups[0].saveStatus).toBe('error')
      expect(result.editDraft?.groups[0].saveError).toBe('boom')
    })

    it('REMOVE_PARAMETER_GROUP drops the card', () => {
      const twoCards = materialsReducer(opened, actions.addParameterGroup())
      const result = materialsReducer(twoCards, actions.removeParameterGroup('12', 1))
      expect(result.editDraft?.groups.map((g) => g.id)).toEqual([2])
    })
  })

  // Card ids restart at 1 for EVERY material, so an outcome that names only a
  // card id cannot say which material it belongs to. Clicking another material
  // while a save/upload/delete is still in flight used to land the result on the
  // new material's same-numbered card — marking it saved, overwriting its
  // baseline, or writing the wrong texture onto it.
  describe('a card outcome that arrives after the user switched materials', () => {
    // Material '12' is open with one card; its save is in flight. Then material
    // '37' — whose first card is ALSO id 1, and is untouched — takes over the form.
    const switched = (): ReturnType<typeof materialsReducer> => {
      const openedA = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'A'))
      const savingA = materialsReducer(
        openedA,
        actions.saveParameterGroupRequested({
          groupId: '12',
          cardId: 1,
          materialTypeId: 6,
          properties: {},
          saved: false,
          scenarioId: null
        })
      )
      return materialsReducer(
        savingA,
        actions.openSavedMaterialLoaded({
          id: '37',
          name: 'B',
          members: [{ materialTypeId: 9, properties: { air_humidity: '0.5' } }]
        })
      )
    }

    it('SAVE_PARAMETER_GROUP_SUCCEEDED for the OLD material leaves the new one alone', () => {
      // Edit '37' card 1 first, so a stale success has something to corrupt: it
      // would snapshot this un-sent edit as the backend's copy, and the card
      // would go clean (Save greys out) with the change never persisted.
      const before = materialsReducer(
        switched(),
        actions.setParameterGroupValue(1, 'air_humidity', '0.9')
      )
      const result = materialsReducer(before, actions.saveParameterGroupSucceeded('12', 1))

      expect(result.editDraft?.groupId).toBe('37')
      // The edit stays DIRTY — its baseline is untouched, so Save is still open.
      expect(result.editDraft?.groups[0].savedValues?.air_humidity).toBe('0.5')
      expect(result.editDraft?.groups[0]).toEqual(before.editDraft?.groups[0])
      // ...and the unsent edit did not reach '37's cache either.
      expect(result.detailsById['37']).toEqual(before.detailsById['37'])
    })

    it('UPLOAD_TEXTURE_SUCCEEDED for the OLD material does not write its texture here', () => {
      const before = switched()
      const result = materialsReducer(
        before,
        actions.uploadTextureSucceeded('12', 1, 'uploads/materials/12/grass.png')
      )
      expect(result.editDraft?.groups[0].values.texture_file).toBeUndefined()
      expect(result.editDraft?.groups[0]).toEqual(before.editDraft?.groups[0])
    })

    it('SAVE_PARAMETER_GROUP_FAILED for the OLD material does not error the new card', () => {
      const result = materialsReducer(switched(), actions.saveParameterGroupFailed('12', 1, 'boom'))
      expect(result.editDraft?.groups[0].saveStatus).toBe('idle')
      expect(result.editDraft?.groups[0].saveError).toBeNull()
    })

    it('REMOVE_PARAMETER_GROUP for the OLD material does not drop the new card', () => {
      const result = materialsReducer(switched(), actions.removeParameterGroup('12', 1))
      expect(result.editDraft?.groups.map((g) => g.id)).toEqual([1])
    })

    // Refusing to apply the outcome is only half the job. The BACKEND took these
    // writes, so the old material's cached detail now predates them — and the open
    // saga serves that cache instead of re-GETting. It must be dropped, or the
    // save is invisible until a full list reload.
    describe('the old material’s cached detail is invalidated', () => {
      // '12' was created empty, so CREATE_MATERIAL_SUCCEEDED seeded its cache.
      it('after a save that landed', () => {
        const before = switched()
        expect(before.detailsById['12']).toBeDefined()
        const result = materialsReducer(before, actions.saveParameterGroupSucceeded('12', 1))
        expect(result.detailsById['12']).toBeUndefined()
        // The material in the form is untouched — only the absent one is dropped.
        expect(result.detailsById['37']).toBeDefined()
      })

      // NOT after an upload: it stores a file and returns a path but persists
      // nothing, so the cache still matches the backend and must be left alone.
      it('but NOT after an upload — it persists nothing, so the cache still holds', () => {
        const before = switched()
        expect(before.detailsById['12']).toBeDefined()
        const result = materialsReducer(
          before,
          actions.uploadTextureSucceeded('12', 1, 'uploads/materials/12/grass.png')
        )
        expect(result.detailsById['12']).toBeDefined()
      })

      it('after a member delete that landed', () => {
        const result = materialsReducer(switched(), actions.removeParameterGroup('12', 1))
        expect(result.detailsById['12']).toBeUndefined()
      })

      it('but NOT after a failure — nothing was persisted, so the cache still holds', () => {
        const result = materialsReducer(switched(), actions.saveParameterGroupFailed('12', 1, 'x'))
        expect(result.detailsById['12']).toBeDefined()
      })
    })
  })

  // A failed row-click used to be dispatched into the void, leaving the panel on
  // the previous material with no error. It still reports inline; a failed DELETE
  // reports through the saga's toast instead, so it deliberately leaves no banner.
  describe('list-level action failures', () => {
    it('OPEN_SAVED_MATERIAL_FAILED records the error', () => {
      const result = materialsReducer(initialState, actions.openSavedMaterialFailed('7', 'boom'))
      expect(result.actionError).toBe('boom')
    })

    it('DELETE_MATERIAL_FAILED does NOT record the error (the toast owns it)', () => {
      const result = materialsReducer(initialState, actions.deleteMaterialFailed('7', 'nope'))
      expect(result.actionError).toBeNull()
    })

    it('a material that then opens clears the error', () => {
      const failed = materialsReducer(initialState, actions.openSavedMaterialFailed('7', 'boom'))
      const result = materialsReducer(
        failed,
        actions.openSavedMaterialLoaded({ id: '7', name: 'A', members: [] })
      )
      expect(result.actionError).toBeNull()
    })

    it('a delete that lands clears a stale open-failure banner', () => {
      const failed = materialsReducer(initialState, actions.openSavedMaterialFailed('7', 'boom'))
      expect(materialsReducer(failed, actions.removeMaterial('7')).actionError).toBeNull()
    })
  })

  it('LIST_MATERIALS_SUCCEEDED clears a stale create error (it outlived a tab switch)', () => {
    const failed = materialsReducer(initialState, actions.createMaterialFailed('boom'))
    expect(failed.createStatus).toBe('error')
    const result = materialsReducer(failed, actions.listMaterialsSucceeded([make('9', 'A')]))
    expect(result.createStatus).toBe('idle')
    expect(result.createError).toBeNull()
  })

  describe('card delete in flight', () => {
    const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
    const requested = materialsReducer(
      opened,
      actions.deleteParameterGroupRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 6,
        saved: true,
        scenarioId: null
      })
    )

    it('DELETE_PARAMETER_GROUP_REQUESTED marks it deleting (so the trash locks)', () => {
      expect(requested.editDraft?.groups[0].deleteStatus).toBe('deleting')
      // The card is not "saving" — Save keeps its own copy and its own state.
      expect(requested.editDraft?.groups[0].saveStatus).toBe('idle')
    })

    // A delete failure writes `saveError` but leaves `saveStatus` idle, so an
    // edit-clears-error path gated on the STATUS never fired for it — the red text
    // stuck around reading as a save failure.
    it('a delete error clears on the next edit, like a save error does', () => {
      const failed = materialsReducer(requested, actions.deleteParameterGroupFailed('12', 1, 'boom'))
      expect(failed.editDraft?.groups[0].saveError).toBe('boom')

      const result = materialsReducer(failed, actions.setParameterGroupValue(1, 'opacity', '50'))
      expect(result.editDraft?.groups[0].saveError).toBeNull()
      expect(result.editDraft?.groups[0].saveStatus).toBe('idle')
    })

    it('DELETE_PARAMETER_GROUP_FAILED releases the trash and shows why', () => {
      const result = materialsReducer(
        requested,
        actions.deleteParameterGroupFailed('12', 1, 'boom')
      )
      expect(result.editDraft?.groups[0].deleteStatus).toBe('idle')
      expect(result.editDraft?.groups[0].saveError).toBe('boom')
      // A failed DELETE must not disable Save — that call never ran.
      expect(result.editDraft?.groups[0].saveStatus).toBe('idle')
    })
  })

  it('SET_PARAMETER_GROUP_VALUE clears a save error (the edit answers it)', () => {
    const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
    const failed = materialsReducer(opened, actions.saveParameterGroupFailed('12', 1, 'boom'))
    expect(failed.editDraft?.groups[0].saveStatus).toBe('error')

    const result = materialsReducer(failed, actions.setParameterGroupValue(1, 'opacity', '50'))
    expect(result.editDraft?.groups[0].saveStatus).toBe('idle')
    expect(result.editDraft?.groups[0].saveError).toBeNull()
  })

  // The Heat Transfer Flag is declared by several material types, but a material
  // is one-sided or two-sided as a WHOLE — so it is one answer per material, not
  // one per type, and every card that shows it must agree.
  describe('the material-wide Heat Transfer Flag', () => {
    const FLAG = 'two_sided_heat_transfer'

    // A material with two cards: card 1 (Radiation) and card 2 (Photosynthesis).
    const twoCards = (): ReturnType<typeof materialsReducer> => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 1))
      const added = materialsReducer(typed, actions.addParameterGroup())
      return materialsReducer(added, actions.setParameterGroupType(2, 4))
    }

    it('writes the answer onto every card, not just the one edited', () => {
      const result = materialsReducer(
        twoCards(),
        actions.setParameterGroupValue(1, FLAG, 'Two Sided')
      )

      expect(result.editDraft?.groups[0].values[FLAG]).toBe('Two Sided')
      expect(result.editDraft?.groups[1].values[FLAG]).toBe('Two Sided')
    })

    it('reflects a change made from ANY card back onto the others', () => {
      const set = materialsReducer(twoCards(), actions.setParameterGroupValue(1, FLAG, 'Two Sided'))
      const changed = materialsReducer(set, actions.setParameterGroupValue(2, FLAG, 'One Sided'))

      expect(changed.editDraft?.groups[0].values[FLAG]).toBe('One Sided')
      expect(changed.editDraft?.groups[1].values[FLAG]).toBe('One Sided')
    })

    it('leaves ordinary per-type values on the card they were typed into', () => {
      const result = materialsReducer(
        twoCards(),
        actions.setParameterGroupValue(1, 'emissivity', '0.9')
      )

      expect(result.editDraft?.groups[0].values.emissivity).toBe('0.9')
      expect(result.editDraft?.groups[1].values.emissivity).toBeUndefined()
    })

    it('seeds a card that picks its type AFTER the flag was answered', () => {
      // The reported flow: set the flag on the first type, then add a second
      // type — it must open with the answer already given, not a blank.
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 1))
      const set = materialsReducer(typed, actions.setParameterGroupValue(1, FLAG, 'Two Sided'))
      const added = materialsReducer(set, actions.addParameterGroup())
      const result = materialsReducer(added, actions.setParameterGroupType(2, 4))

      expect(result.editDraft?.groups[1].values[FLAG]).toBe('Two Sided')
    })

    it('keeps the flag when a card SWAPS its type, dropping everything else', () => {
      const opened = materialsReducer(initialState, actions.createMaterialSucceeded('12', 'Mat'))
      const typed = materialsReducer(opened, actions.setParameterGroupType(1, 1))
      const added = materialsReducer(typed, actions.addParameterGroup())
      const typed2 = materialsReducer(added, actions.setParameterGroupType(2, 4))
      const filled = materialsReducer(typed2, actions.setParameterGroupValue(2, FLAG, 'Two Sided'))
      const withOther = materialsReducer(
        filled,
        actions.setParameterGroupValue(2, 'stomatal_sidedness', '0.5')
      )

      const swapped = materialsReducer(withOther, actions.setParameterGroupType(2, 6))

      expect(swapped.editDraft?.groups[1].values[FLAG]).toBe('Two Sided')
      expect(swapped.editDraft?.groups[1].values.stomatal_sidedness).toBeUndefined()
    })

    it('does not let an unanswered card blank an answer another card holds', () => {
      const set = materialsReducer(twoCards(), actions.setParameterGroupValue(1, FLAG, 'Two Sided'))
      // Card 1 swaps type; card 2 still carries the answer, so it survives.
      const swapped = materialsReducer(set, actions.setParameterGroupType(1, 6))

      expect(swapped.editDraft?.groups[0].values[FLAG]).toBe('Two Sided')
    })
  })

  it('does not mutate the original state', () => {
    materialsReducer(initialState, actions.listMaterialsSucceeded([make('9', 'Grass')]))
    expect(initialState.order).toHaveLength(0)
  })
})
