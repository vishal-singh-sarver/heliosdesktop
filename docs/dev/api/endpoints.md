<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# HTTP endpoints

*Generated 2026-09-09.*

**130 operations** across **103 paths**, from the FastAPI application's own OpenAPI schema.

!!! tip "The live schema is always available"
    While the backend is running: **`/docs`** (Swagger UI) and **`/openapi.json`**.

!!! warning "Not every endpoint is reachable from the UI"
    Rows marked :material-sleep: are on a router the renderer never calls. See
    [Dormant surface](../../reference/dormant.md).

See [Backend API](http.md) for the conventions these all follow.

## `catalog`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/data-types/` | List Data Types |
|  | `POST` | `/api/data-types/` | Create Data Type |
|  | `DELETE` | `/api/data-types/{data_type_id}` | Delete Data Type |
|  | `GET` | `/api/data-types/{data_type_id}` | Get Data Type |
|  | `PATCH` | `/api/data-types/{data_type_id}` | Update Data Type |
| :material-sleep: | `GET` | `/api/data-units/` | List Data Units |
| :material-sleep: | `POST` | `/api/data-units/` | Create Data Unit |
| :material-sleep: | `DELETE` | `/api/data-units/{data_unit_id}` | Delete Data Unit |
| :material-sleep: | `GET` | `/api/data-units/{data_unit_id}` | Get Data Unit |
| :material-sleep: | `PATCH` | `/api/data-units/{data_unit_id}` | Update Data Unit |

## `geometry`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/geometry/all/binary` | Get All Geometry Binary |
|  | `GET` | `/api/geometry/all/gpu` | Get All Geometry Gpu |
|  | `POST` | `/api/geometry/binary` | Get Geometry Binary Subset |
|  | `GET` | `/api/geometry/count` | Get Geometry Count |
|  | `POST` | `/api/geometry/delete-batch` | Delete Primitives Batch |
|  | `DELETE` | `/api/geometry/object/{object_id}` | Delete Object |
|  | `GET` | `/api/geometry/objects` | Get Objects |
|  | `POST` | `/api/geometry/patch` | Add Patch |
|  | `POST` | `/api/geometry/tile` | Add Tile |
|  | `POST` | `/api/geometry/tile/textured` | Add Textured Tile |
|  | `POST` | `/api/geometry/triangle/textured` | Add Textured Triangle |
|  | `DELETE` | `/api/geometry/{uuid}` | Delete Primitive |

## `import`

| | Method | Path | Summary |
|---|---|---|---|
| :material-sleep: | `POST` | `/api/import/obj` | Import Obj |
| :material-sleep: | `POST` | `/api/import/ply` | Import Ply |

## `m2-catalog`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/catalog/datatypes` | List Datatypes |
|  | `GET` | `/api/catalog/material-types` | List Material Types |
|  | `GET` | `/api/catalog/model-types` | List Model Types |
|  | `GET` | `/api/catalog/object-types` | List Object Types |

## `m2-geometry`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/geometry/binary` | Get Scene Geometry Binary |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups` | List Groups |
|  | `POST` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups` | Create Group |
|  | `DELETE` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}` | Delete Group |
|  | `DELETE` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/objects` | Delete Group Objects |
|  | `PATCH` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/rename` | Rename Group |
|  | `PATCH` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/visibility` | Update Group Visibility |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/material-sync` | Get Material Sync |
|  | `PUT` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/material-sync` | Apply Material Sync |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/models` | Get Scenario Models |
|  | `PATCH` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/models` | Update Scenario Models |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects` | List Objects |
|  | `POST` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects` | Create Object |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/next-name` | Next Name |
|  | `DELETE` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` | Delete Object |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` | Get Object |
|  | `PATCH` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` | Update Object |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/geometry/binary` | Get Object Geometry Binary |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/geometry/gpu` | Get Object Geometry Gpu |
|  | `GET` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups` | List Assignments |
|  | `POST` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups` | Assign Material Group |
|  | `DELETE` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups/{group_id}` | Unassign Material Group |
|  | `PATCH` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups/{group_id}` | Update Group Assignment |
|  | `PATCH` | `/api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/rename` | Rename Object |

## `m2-materials`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/materials/library/groups` | List Groups |
|  | `POST` | `/api/materials/library/groups` | Create Group |
|  | `GET` | `/api/materials/library/groups/next-name` | Next Name |
|  | `DELETE` | `/api/materials/library/groups/{group_id}` | Delete Group |
|  | `GET` | `/api/materials/library/groups/{group_id}` | Get Group |
|  | `PUT` | `/api/materials/library/groups/{group_id}` | Update Group |
|  | `DELETE` | `/api/materials/library/groups/{group_id}/files` | Delete File |
|  | `POST` | `/api/materials/library/groups/{group_id}/files/{property_name}` | Upload File Property |
|  | `POST` | `/api/materials/library/groups/{group_id}/materials` | Add Group Material |
|  | `DELETE` | `/api/materials/library/groups/{group_id}/materials/{material_type_id}` | Remove Group Material |
|  | `PUT` | `/api/materials/library/groups/{group_id}/materials/{material_type_id}` | Update Group Material |
|  | `PATCH` | `/api/materials/library/groups/{group_id}/rename` | Rename Group |
|  | `POST` | `/api/materials/library/groups/{group_id}/spectral` | Upload Spectral |
|  | `DELETE` | `/api/materials/library/groups/{group_id}/spectral/labels` | Delete Spectral Labels |
|  | `GET` | `/api/materials/library/groups/{group_id}/spectral/labels` | Spectral Labels |

## `materials`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/materials` | List Materials |
|  | `POST` | `/api/materials` | Create Material |
|  | `POST` | `/api/materials/assign` | Assign Material |
|  | `GET` | `/api/materials/textures/library` | Get Texture Library |
|  | `GET` | `/api/materials/textures/preview` | Get Texture Preview |
|  | `DELETE` | `/api/materials/{label}` | Delete Material |
|  | `PUT` | `/api/materials/{label}/color` | Set Material Color |
|  | `GET` | `/api/materials/{label}/primitives` | Get Material Primitives |
|  | `PUT` | `/api/materials/{label}/rename` | Rename Material |
|  | `PUT` | `/api/materials/{label}/texture` | Set Material Texture |
|  | `PUT` | `/api/materials/{label}/texture-override` | Set Material Texture Override |
|  | `PUT` | `/api/materials/{label}/twosided` | Set Material Twosided |

## `objects`

| | Method | Path | Summary |
|---|---|---|---|
| :material-sleep: | `GET` | `/api/objects/{object_id}/children/binary` | Get Object Children Binary |
| :material-sleep: | `GET` | `/api/objects/{object_id}/children/gpu` | Get Object Children Gpu |
| :material-sleep: | `GET` | `/api/objects/{object_id}/geometry/binary` | Get Object Geometry Binary |
| :material-sleep: | `GET` | `/api/objects/{object_id}/geometry/gpu` | Get Object Geometry Gpu |
| :material-sleep: | `GET` | `/api/objects/{object_id}/info` | Get Object Info |

## `plantarch`

| | Method | Path | Summary |
|---|---|---|---|
| :material-sleep: | `GET` | `/api/plantarch/canopy` | Build Canopy Get |
| :material-sleep: | `POST` | `/api/plantarch/canopy` | Build Canopy |
| :material-sleep: | `POST` | `/api/plantarch/canopy/stream` | Build Canopy Stream |
| :material-sleep: | `GET` | `/api/plantarch/species` | Get Plant Species |

## `project`

| | Method | Path | Summary |
|---|---|---|---|
|  | `POST` | `/api/project/create` | Create Project |
|  | `GET` | `/api/project/recent` | List Recent Projects |
|  | `DELETE` | `/api/project/{project_id}` | Delete Project |
|  | `GET` | `/api/project/{project_id}` | Get Project |
|  | `PATCH` | `/api/project/{project_id}` | Update Project |

## `scenario`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/project/{project_id}/scenarios` | List Scenarios |
|  | `POST` | `/api/project/{project_id}/scenarios/create` | Create Scenario |
|  | `DELETE` | `/api/project/{project_id}/scenarios/{scenario_id}` | Delete Scenario |
|  | `POST` | `/api/project/{project_id}/scenarios/{scenario_id}/discard` | Discard Scenario |
|  | `GET` | `/api/project/{project_id}/scenarios/{scenario_id}/init` | Init Scenario |

## `scripting`

| | Method | Path | Summary |
|---|---|---|---|
| :material-sleep: | `POST` | `/api/script/execute` | Execute Script |

## `system`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/` | Root |
|  | `GET` | `/api/pyhelios-info` | Pyhelios Info |
|  | `GET` | `/health` | Health |
|  | `GET` | `/version` | Version |

## `textures`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/textures/defaults` | List Defaults |
|  | `GET` | `/api/textures/serve` | Serve Texture |

## `timeseries`

| | Method | Path | Summary |
|---|---|---|---|
| :material-sleep: | `DELETE` | `/api/timeseries` | Delete Timeseries |
| :material-sleep: | `GET` | `/api/timeseries` | Get Timeseries |
| :material-sleep: | `POST` | `/api/timeseries/apply` | Apply Timeseries |

## `transforms`

| | Method | Path | Summary |
|---|---|---|---|
|  | `GET` | `/api/geometry/object/{object_id}/centroid` | Get Object Centroid |
|  | `POST` | `/api/geometry/rotate` | Rotate Object |
|  | `POST` | `/api/geometry/scale` | Scale Object |
|  | `POST` | `/api/geometry/translate` | Translate Object |

## `tree`

| | Method | Path | Summary |
|---|---|---|---|
| :material-sleep: | `POST` | `/api/tree/build` | Build Tree |
| :material-sleep: | `GET` | `/api/tree/types` | Get Tree Types |
| :material-sleep: | `GET` | `/api/tree/{tree_id}/parts` | Get Tree Parts |

## `weather`

| | Method | Path | Summary |
|---|---|---|---|
|  | `POST` | `/api/weather/project/{project_id}/scenario/{scenario_id}/addCol` | Add Columns |
|  | `POST` | `/api/weather/project/{project_id}/scenario/{scenario_id}/addRow` | Add Rows |
|  | `DELETE` | `/api/weather/project/{project_id}/scenario/{scenario_id}/clear_data` | Clear Weather Data |
|  | `POST` | `/api/weather/project/{project_id}/scenario/{scenario_id}/delete` | Delete Weather |
|  | `POST` | `/api/weather/project/{project_id}/scenario/{scenario_id}/deleteRow` | Delete Weather Row |
|  | `GET` | `/api/weather/project/{project_id}/scenario/{scenario_id}/getAllTimeSeriesData` | Get All Timeseries Data |
|  | `GET` | `/api/weather/project/{project_id}/scenario/{scenario_id}/inspect` | Inspect |
|  | `PATCH` | `/api/weather/project/{project_id}/scenario/{scenario_id}/update` | Update Weather |
|  | `PATCH` | `/api/weather/project/{project_id}/scenario/{scenario_id}/updateCol/{column_id}` | Update Columns |
|  | `POST` | `/api/weather/project/{project_id}/scenario/{scenario_id}/uploadfile` | Upload File |
|  | `DELETE` | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` | Clear Weather Data Header |
|  | `GET` | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` | Get Weather Data Header |
|  | `PUT` | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` | Replace Weather Data Header |
|  | `DELETE` | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header/{header_id}` | Delete Weather Data Header |
|  | `PATCH` | `/api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header/{header_id}` | Update Weather Data Header |

