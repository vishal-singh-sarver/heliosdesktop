<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# All endpoints

*Generated 2026-09-11.*

**107 operations** across **85 paths**, generated from the FastAPI application's own OpenAPI schema.

Request bodies and parameters come from the schema and cannot drift. Response bodies are derived from the service code — 107 of 107 are documented; see [Conventions](http.md#response-bodies).

!!! tip "The live schema is always available"
    While the backend is running: **`/docs`** (Swagger UI) and **`/openapi.json`**.

!!! note "Every endpoint here is one the UI actually calls"
    23 further operations are mounted but unreachable from the renderer, and are
    deliberately left out of this reference. They are listed in
    [Dormant surface](../../reference/dormant.md) and still appear in the live `/docs` schema.

## [`catalog`](ops/catalog.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/catalog.md#op-get-api-data-types) | `/api/data-types/` | List Data Types |
| [`POST`](ops/catalog.md#op-post-api-data-types) | `/api/data-types/` | Create Data Type |
| [`DELETE`](ops/catalog.md#op-delete-api-data-types-data-type-id) | `/api/data-types/{data_type_id}` | Delete Data Type |
| [`GET`](ops/catalog.md#op-get-api-data-types-data-type-id) | `/api/data-types/{data_type_id}` | Get Data Type |
| [`PATCH`](ops/catalog.md#op-patch-api-data-types-data-type-id) | `/api/data-types/{data_type_id}` | Update Data Type |

## [`geometry`](ops/geometry.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/geometry.md#op-get-api-geometry-all-binary) | `/api/geometry/all/binary` | Get All Geometry Binary |
| [`GET`](ops/geometry.md#op-get-api-geometry-all-gpu) | `/api/geometry/all/gpu` | Get All Geometry Gpu |
| [`POST`](ops/geometry.md#op-post-api-geometry-binary) | `/api/geometry/binary` | Get Geometry Binary Subset |
| [`GET`](ops/geometry.md#op-get-api-geometry-count) | `/api/geometry/count` | Get Geometry Count |
| [`POST`](ops/geometry.md#op-post-api-geometry-delete-batch) | `/api/geometry/delete-batch` | Delete Primitives Batch |
| [`DELETE`](ops/geometry.md#op-delete-api-geometry-object-object-id) | `/api/geometry/object/{object_id}` | Delete Object |
| [`GET`](ops/geometry.md#op-get-api-geometry-objects) | `/api/geometry/objects` | Get Objects |
| [`POST`](ops/geometry.md#op-post-api-geometry-patch) | `/api/geometry/patch` | Add Patch |
| [`POST`](ops/geometry.md#op-post-api-geometry-tile) | `/api/geometry/tile` | Add Tile |
| [`POST`](ops/geometry.md#op-post-api-geometry-tile-textured) | `/api/geometry/tile/textured` | Add Textured Tile |
| [`POST`](ops/geometry.md#op-post-api-geometry-triangle-textured) | `/api/geometry/triangle/textured` | Add Textured Triangle |
| [`DELETE`](ops/geometry.md#op-delete-api-geometry-uuid) | `/api/geometry/{uuid}` | Delete Primitive |

## [`m2-catalog`](ops/m2-catalog.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/m2-catalog.md#op-get-api-catalog-datatypes) | `/api/catalog/datatypes` | List Datatypes |
| [`GET`](ops/m2-catalog.md#op-get-api-catalog-material-types) | `/api/catalog/material-types` | List Material Types |
| [`GET`](ops/m2-catalog.md#op-get-api-catalog-model-types) | `/api/catalog/model-types` | List Model Types |
| [`GET`](ops/m2-catalog.md#op-get-api-catalog-object-types) | `/api/catalog/object-types` | List Object Types |

## [`m2-geometry`](ops/m2-geometry.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-geometry-binary) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/geometry/binary` | Get Scene Geometry Binary |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-groups) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups` | List Groups |
| [`POST`](ops/m2-geometry.md#op-post-api-geometry-project-project-id-scenario-scenario-id-groups) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups` | Create Group |
| [`DELETE`](ops/m2-geometry.md#op-delete-api-geometry-project-project-id-scenario-scenario-id-groups-group-id) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}` | Delete Group |
| [`DELETE`](ops/m2-geometry.md#op-delete-api-geometry-project-project-id-scenario-scenario-id-groups-group-id-objects) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/objects` | Delete Group Objects |
| [`PATCH`](ops/m2-geometry.md#op-patch-api-geometry-project-project-id-scenario-scenario-id-groups-group-id-rename) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/rename` | Rename Group |
| [`PATCH`](ops/m2-geometry.md#op-patch-api-geometry-project-project-id-scenario-scenario-id-groups-group-id-visibility) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/visibility` | Update Group Visibility |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-material-sync) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/material-sync` | Get Material Sync |
| [`PUT`](ops/m2-geometry.md#op-put-api-geometry-project-project-id-scenario-scenario-id-material-sync) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/material-sync` | Apply Material Sync |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-models) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/models` | Get Scenario Models |
| [`PATCH`](ops/m2-geometry.md#op-patch-api-geometry-project-project-id-scenario-scenario-id-models) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/models` | Update Scenario Models |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-objects) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects` | List Objects |
| [`POST`](ops/m2-geometry.md#op-post-api-geometry-project-project-id-scenario-scenario-id-objects) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects` | Create Object |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-next-name) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/next-name` | Next Name |
| [`DELETE`](ops/m2-geometry.md#op-delete-api-geometry-project-project-id-scenario-scenario-id-objects-object-id) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` | Delete Object |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` | Get Object |
| [`PATCH`](ops/m2-geometry.md#op-patch-api-geometry-project-project-id-scenario-scenario-id-objects-object-id) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` | Update Object |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-geometry-binary) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/geometry/binary` | Get Object Geometry Binary |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-geometry-gpu) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/geometry/gpu` | Get Object Geometry Gpu |
| [`GET`](ops/m2-geometry.md#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups` | List Assignments |
| [`POST`](ops/m2-geometry.md#op-post-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups` | Assign Material Group |
| [`DELETE`](ops/m2-geometry.md#op-delete-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups-group-id) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups/{group_id}` | Unassign Material Group |
| [`PATCH`](ops/m2-geometry.md#op-patch-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups-group-id) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups/{group_id}` | Update Group Assignment |
| [`PATCH`](ops/m2-geometry.md#op-patch-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-rename) | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/rename` | Rename Object |

## [`m2-materials`](ops/m2-materials.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/m2-materials.md#op-get-api-materials-library-groups) | `/api/materials/library/groups` | List Groups |
| [`POST`](ops/m2-materials.md#op-post-api-materials-library-groups) | `/api/materials/library/groups` | Create Group |
| [`GET`](ops/m2-materials.md#op-get-api-materials-library-groups-next-name) | `/api/materials/library/groups/next-name` | Next Name |
| [`DELETE`](ops/m2-materials.md#op-delete-api-materials-library-groups-group-id) | `/api/materials/library/groups/{group_id}` | Delete Group |
| [`GET`](ops/m2-materials.md#op-get-api-materials-library-groups-group-id) | `/api/materials/library/groups/{group_id}` | Get Group |
| [`PUT`](ops/m2-materials.md#op-put-api-materials-library-groups-group-id) | `/api/materials/library/groups/{group_id}` | Update Group |
| [`DELETE`](ops/m2-materials.md#op-delete-api-materials-library-groups-group-id-files) | `/api/materials/library/groups/{group_id}/files` | Delete File |
| [`POST`](ops/m2-materials.md#op-post-api-materials-library-groups-group-id-files-property-name) | `/api/materials/library/groups/{group_id}/files/{property_name}` | Upload File Property |
| [`POST`](ops/m2-materials.md#op-post-api-materials-library-groups-group-id-materials) | `/api/materials/library/groups/{group_id}/materials` | Add Group Material |
| [`DELETE`](ops/m2-materials.md#op-delete-api-materials-library-groups-group-id-materials-material-type-id) | `/api/materials/library/groups/{group_id}/materials/{material_type_id}` | Remove Group Material |
| [`PUT`](ops/m2-materials.md#op-put-api-materials-library-groups-group-id-materials-material-type-id) | `/api/materials/library/groups/{group_id}/materials/{material_type_id}` | Update Group Material |
| [`PATCH`](ops/m2-materials.md#op-patch-api-materials-library-groups-group-id-rename) | `/api/materials/library/groups/{group_id}/rename` | Rename Group |
| [`POST`](ops/m2-materials.md#op-post-api-materials-library-groups-group-id-spectral) | `/api/materials/library/groups/{group_id}/spectral` | Upload Spectral |
| [`DELETE`](ops/m2-materials.md#op-delete-api-materials-library-groups-group-id-spectral-labels) | `/api/materials/library/groups/{group_id}/spectral/labels` | Delete Spectral Labels |
| [`GET`](ops/m2-materials.md#op-get-api-materials-library-groups-group-id-spectral-labels) | `/api/materials/library/groups/{group_id}/spectral/labels` | Spectral Labels |

## [`materials`](ops/materials.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/materials.md#op-get-api-materials) | `/api/materials` | List Materials |
| [`POST`](ops/materials.md#op-post-api-materials) | `/api/materials` | Create Material |
| [`POST`](ops/materials.md#op-post-api-materials-assign) | `/api/materials/assign` | Assign Material |
| [`GET`](ops/materials.md#op-get-api-materials-textures-library) | `/api/materials/textures/library` | Get Texture Library |
| [`GET`](ops/materials.md#op-get-api-materials-textures-preview) | `/api/materials/textures/preview` | Get Texture Preview |
| [`DELETE`](ops/materials.md#op-delete-api-materials-label) | `/api/materials/{label}` | Delete Material |
| [`PUT`](ops/materials.md#op-put-api-materials-label-color) | `/api/materials/{label}/color` | Set Material Color |
| [`GET`](ops/materials.md#op-get-api-materials-label-primitives) | `/api/materials/{label}/primitives` | Get Material Primitives |
| [`PUT`](ops/materials.md#op-put-api-materials-label-rename) | `/api/materials/{label}/rename` | Rename Material |
| [`PUT`](ops/materials.md#op-put-api-materials-label-texture) | `/api/materials/{label}/texture` | Set Material Texture |
| [`PUT`](ops/materials.md#op-put-api-materials-label-texture-override) | `/api/materials/{label}/texture-override` | Set Material Texture Override |
| [`PUT`](ops/materials.md#op-put-api-materials-label-twosided) | `/api/materials/{label}/twosided` | Set Material Twosided |

## [`project`](ops/project.md)

| Method | Path | Summary |
|---|---|---|
| [`POST`](ops/project.md#op-post-api-project-create) | `/api/project/create` | Create Project |
| [`GET`](ops/project.md#op-get-api-project-recent) | `/api/project/recent` | List Recent Projects |
| [`DELETE`](ops/project.md#op-delete-api-project-project-id) | `/api/project/{project_id}` | Delete Project |
| [`GET`](ops/project.md#op-get-api-project-project-id) | `/api/project/{project_id}` | Get Project |
| [`PATCH`](ops/project.md#op-patch-api-project-project-id) | `/api/project/{project_id}` | Update Project |

## [`scenario`](ops/scenario.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/scenario.md#op-get-api-project-project-id-scenarios) | `/api/project/{project_id}/scenarios` | List Scenarios |
| [`POST`](ops/scenario.md#op-post-api-project-project-id-scenarios-create) | `/api/project/{project_id}/scenarios/create` | Create Scenario |
| [`DELETE`](ops/scenario.md#op-delete-api-project-project-id-scenarios-scenario-id) | `/api/project/{project_id}/scenarios/{scenario_id}` | Delete Scenario |
| [`POST`](ops/scenario.md#op-post-api-project-project-id-scenarios-scenario-id-discard) | `/api/project/{project_id}/scenarios/{scenario_id}/discard` | Discard Scenario |
| [`GET`](ops/scenario.md#op-get-api-project-project-id-scenarios-scenario-id-init) | `/api/project/{project_id}/scenarios/{scenario_id}/init` | Init Scenario |

## [`system`](ops/system.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/system.md#op-get) | `/` | Root |
| [`GET`](ops/system.md#op-get-api-pyhelios-info) | `/api/pyhelios-info` | Pyhelios Info |
| [`GET`](ops/system.md#op-get-health) | `/health` | Health |
| [`GET`](ops/system.md#op-get-version) | `/version` | Version |

## [`textures`](ops/textures.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/textures.md#op-get-api-textures-defaults) | `/api/textures/defaults` | List Defaults |
| [`GET`](ops/textures.md#op-get-api-textures-serve) | `/api/textures/serve` | Serve Texture |

## [`transforms`](ops/transforms.md)

| Method | Path | Summary |
|---|---|---|
| [`GET`](ops/transforms.md#op-get-api-geometry-object-object-id-centroid) | `/api/geometry/object/{object_id}/centroid` | Get Object Centroid |
| [`POST`](ops/transforms.md#op-post-api-geometry-rotate) | `/api/geometry/rotate` | Rotate Object |
| [`POST`](ops/transforms.md#op-post-api-geometry-scale) | `/api/geometry/scale` | Scale Object |
| [`POST`](ops/transforms.md#op-post-api-geometry-translate) | `/api/geometry/translate` | Translate Object |

## [`weather`](ops/weather.md)

| Method | Path | Summary |
|---|---|---|
| [`POST`](ops/weather.md#op-post-api-weather-project-project-id-scenario-scenario-id-addcol) | `/api/weather/project/{project_id}/scenario/{scenario_id}/addCol` | Add Columns |
| [`POST`](ops/weather.md#op-post-api-weather-project-project-id-scenario-scenario-id-addrow) | `/api/weather/project/{project_id}/scenario/{scenario_id}/addRow` | Add Rows |
| [`DELETE`](ops/weather.md#op-delete-api-weather-project-project-id-scenario-scenario-id-clear-data) | `/api/weather/project/{project_id}/scenario/{scenario_id}/clear_data` | Clear Weather Data |
| [`POST`](ops/weather.md#op-post-api-weather-project-project-id-scenario-scenario-id-delete) | `/api/weather/project/{project_id}/scenario/{scenario_id}/delete` | Delete Weather |
| [`POST`](ops/weather.md#op-post-api-weather-project-project-id-scenario-scenario-id-deleterow) | `/api/weather/project/{project_id}/scenario/{scenario_id}/deleteRow` | Delete Weather Row |
| [`GET`](ops/weather.md#op-get-api-weather-project-project-id-scenario-scenario-id-getalltimeseriesdata) | `/api/weather/project/{project_id}/scenario/{scenario_id}/getAllTimeSeriesData` | Get All Timeseries Data |
| [`GET`](ops/weather.md#op-get-api-weather-project-project-id-scenario-scenario-id-inspect) | `/api/weather/project/{project_id}/scenario/{scenario_id}/inspect` | Inspect |
| [`PATCH`](ops/weather.md#op-patch-api-weather-project-project-id-scenario-scenario-id-update) | `/api/weather/project/{project_id}/scenario/{scenario_id}/update` | Update Weather |
| [`PATCH`](ops/weather.md#op-patch-api-weather-project-project-id-scenario-scenario-id-updatecol-column-id) | `/api/weather/project/{project_id}/scenario/{scenario_id}/updateCol/{column_id}` | Update Columns |
| [`POST`](ops/weather.md#op-post-api-weather-project-project-id-scenario-scenario-id-uploadfile) | `/api/weather/project/{project_id}/scenario/{scenario_id}/uploadfile` | Upload File |
| [`DELETE`](ops/weather.md#op-delete-api-weather-project-project-id-scenario-scenario-id-weather-data-header) | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` | Clear Weather Data Header |
| [`GET`](ops/weather.md#op-get-api-weather-project-project-id-scenario-scenario-id-weather-data-header) | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` | Get Weather Data Header |
| [`PUT`](ops/weather.md#op-put-api-weather-project-project-id-scenario-scenario-id-weather-data-header) | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` | Replace Weather Data Header |
| [`DELETE`](ops/weather.md#op-delete-api-weather-project-project-id-scenario-scenario-id-weather-data-header-header-id) | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header/{header_id}` | Delete Weather Data Header |
| [`PATCH`](ops/weather.md#op-patch-api-weather-project-project-id-scenario-scenario-id-weather-data-header-header-id) | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header/{header_id}` | Update Weather Data Header |

