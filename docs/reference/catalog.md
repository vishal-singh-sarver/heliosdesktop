<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# Catalog reference

*Generated 2026-09-09.*

Every object type, material type, property and unit currently seeded by the migrations.

The forms in the app are **built from this data**, so this reference is generated from it rather than written by hand. Changing anything here means writing a migration — see [The property system](../dev/arch/properties.md).

Source: `heliosgui.db`, schema version **31**.

## Datatypes

`float`, `integer`, `boolean`, `string`, `date`, `time`, `file`, `enum`

Canonical storage forms are documented in [The property system](../dev/arch/properties.md#canonical-storage-forms).

## Object types

### Crop

_No properties linked yet._

### Ground

| # | Property | Type | Min | Max | Description |
|---|---|---|---|---|---|
| 1 | `length` | `float` | 0.01 | 1000000.0 | Ground size L in meters |
| 2 | `breadth` | `float` | 0.01 | 1000000.0 | Ground size B in meters |
| 3 | `resolution_x` | `integer` | 1.0 | 25000.0 | Ground resolution along X |
| 4 | `resolution_y` | `integer` | 1.0 | 25000.0 | Ground resolution along Y |
| 5 | `position_x` | `float` | -1000000.0 | 1000000.0 | Position X |
| 6 | `position_y` | `float` | -1000000.0 | 1000000.0 | Position Y |
| 7 | `position_z` | `float` | -1000000.0 | 1000000.0 | Position Z |
| 8 | `rotation_z` | `float` | 0.0 | 360.0 | Rotation about the z-axis in degrees |
| 9 | `texture_x` | `integer` | 1.0 |  | Texture repeat count along X |
| 10 | `texture_y` | `integer` | 1.0 |  | Texture repeat count along Y |

## Material types

### Boundary Layer Conductance

Boundary layer conductance model selection and inputs

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 1 | `surface_temperature` | `float` | 223.0 | 400.0 |  | computed |
| 2 | `two_sided_heat_transfer` `["One Sided", "Two Sided"]` | `enum` |  |  |  | editable |
| 3 | `boundary_layer_model` `["Pohlhausen", "InclinedPlate", "Sphere", "Ground"]` | `enum` |  |  |  | editable |
| 4 | `wind_speed` | `float` | 0.0 | 60.0 |  | external |

### Energy Balance

Surface energy balance model inputs

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 1 | `radiation_flux` | `float` | 0.0 | 10000000.0 |  | computed |
| 2 | `boundary_layer_conductance` | `float` | 0.0 | 100.0 |  | computed |
| 3 | `moisture_conductance` | `float` | 0.0 | 100.0 |  | computed |
| 4 | `two_sided_heat_transfer` `["One Sided", "Two Sided"]` | `enum` |  |  |  | editable |
| 5 | `stomatal_sidedness` | `float` | 0.0 | 1.0 |  | editable |
| 6 | `object_length` | `float` | 1e-06 | 1000000.0 |  | editable |
| 7 | `heat_capacity` | `float` | 0.0 | 1000000.0 |  | editable |
| 8 | `wind_speed` | `float` | 0.0 | 60.0 |  | external |
| 9 | `air_temperature` | `float` | 223.0 | 5000.0 |  | external |
| 10 | `surface_humidity` | `float` | 0.0 | 1.0 |  | external |
| 11 | `air_humidity` | `float` | 0.0 | 1.0 |  | external |
| 12 | `air_pressure` | `float` | 87000.0 | 150000.0 |  | external |
| 13 | `other_surface_flux` | `float` | -1000000.0 | 1000000.0 |  | external |

### Photosynthesis

Farquhar photosynthesis model parameters

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 1 | `radiation_flux` | `float` | 0.0 | 1500.0 |  | computed |
| 2 | `surface_temperature` | `float` | 223.0 | 400.0 |  | external |
| 3 | `moisture_conductance` | `float` | 0.0 | 100.0 |  | computed |
| 4 | `boundary_layer_conductance` | `float` | 0.0 | 100.0 |  | computed |
| 5 | `two_sided_heat_transfer` `["One Sided", "Two Sided"]` | `enum` |  |  |  | editable |
| 6 | `stomatal_sidedness` | `float` | 0.0 | 1.0 |  | editable |
| 7 | `vcmax25` | `float` | 0.0 | 1000.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 7 | `submodel` `["farquhar_model"]` | `enum` |  |  |  | editable |
| 8 | `jmax25` | `float` | 0.0 | 1000.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 9 | `tpu25` | `float` | 0.0 | 100.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 10 | `rd25` | `float` | 0.0 | 100.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 11 | `alpha` | `float` | 0.0 | 10.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 12 | `theta` | `float` | 0.0 | 10.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 13 | `dha_vcmax` | `float` | 0.0 | 500.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 14 | `topt_vcmax` | `float` | 273.0 | 373.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 15 | `dha_jmax` | `float` | 0.0 | 500.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 16 | `topt_jmax` | `float` | 273.0 | 373.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 17 | `dhd_jmax` | `float` | 0.0 | 500.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 18 | `dha_tpu` | `float` | 0.0 | 500.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 19 | `topt_tpu` | `float` | 273.0 | 373.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 20 | `dhd_tpu` | `float` | 0.0 | 500.0 | Farquhar model _(when `submodel` = `farquhar_model`)_ | editable |
| 21 | `air_co2` | `float` | 0.0 | 3000.0 |  | external |

### Radiation

Optical and thermal-radiative surface properties

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 1 | `surface_temperature` | `float` | 223.0 | 5000.0 |  | computed |
| 2 | `reflectivity` | `float` | 0.0 | 1.0 |  | superseded |
| 3 | `transmissivity` | `float` | 0.0 | 1.0 |  | superseded |
| 4 | `emissivity` | `float` | 0.0 | 1.0 |  | superseded |
| 5 | `specular_exponent` | `float` | 1.0 | 1000.0 |  | editable |
| 6 | `specular_scale` | `float` | 0.0 | 100.0 |  | editable |
| 7 | `two_sided_heat_transfer` `["One Sided", "Two Sided"]` | `enum` |  |  |  | editable |
| 8 | `spectral_data` | `file` |  |  |  | editable |
| 9 | `use_radiation_bands` | `boolean` |  |  |  | editable |
| 10 | `reflectivity_PAR` | `float` | 0.0 | 1.0 |  | editable |
| 11 | `transmissivity_PAR` | `float` | 0.0 | 1.0 |  | editable |
| 12 | `emissivity_PAR` | `float` | 0.0 | 1.0 |  | editable |
| 13 | `reflectivity_NIR` | `float` | 0.0 | 1.0 |  | editable |
| 14 | `transmissivity_NIR` | `float` | 0.0 | 1.0 |  | editable |
| 15 | `emissivity_NIR` | `float` | 0.0 | 1.0 |  | editable |
| 16 | `reflectivity_LW` | `float` | 0.0 | 1.0 |  | editable |
| 17 | `transmissivity_LW` | `float` | 0.0 | 1.0 |  | editable |
| 18 | `emissivity_LW` | `float` | 0.0 | 1.0 |  | editable |
| 19 | `reflectivity_spectrum` | `string` |  |  | Spectrum _(when `use_radiation_bands` = `false`)_ | editable |
| 20 | `transmissivity_spectrum` | `string` |  |  | Spectrum _(when `use_radiation_bands` = `false`)_ | editable |

### Solar Position

Sun position and atmospheric inputs

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 1 | `utc` | `float` | -12.0 | 14.0 |  | external |
| 2 | `date` | `date` |  |  |  | external |
| 3 | `time` | `time` |  |  |  | external |
| 4 | `latitude` | `float` | -90.0 | 90.0 |  | external |
| 5 | `longitude` | `float` | -180.0 | 180.0 |  | external |
| 6 | `atmospheric_pressure` | `float` |  |  |  | external |
| 7 | `atmospheric_temperature` | `float` |  |  |  | external |
| 8 | `atmospheric_humidity` | `float` |  |  |  | external |
| 9 | `atmospheric_turbidity` | `float` |  |  |  | external |

### Stomatal Conductance

Stomatal conductance sub-models and coefficients

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 1 | `radiation_flux` | `float` | 0.0 | 1500.0 |  | computed |
| 2 | `surface_temperature` | `float` | 223.0 | 400.0 |  | external |
| 3 | `boundary_layer_conductance` | `float` | 0.0 | 100.0 |  | computed |
| 4 | `net_photosynthesis` | `float` | -100.0 | 500.0 |  | computed |
| 5 | `gamma_co2` | `float` | 0.0 | 1000.0 |  | editable |
| 6 | `beta_soil` | `float` | 0.0 | 1.0 |  | external |
| 7 | `air_temperature` | `float` | 223.0 | 400.0 |  | external |
| 8 | `air_humidity` | `float` | 0.0 | 1.0 |  | external |
| 9 | `air_pressure` | `float` | 87000.0 | 150000.0 |  | external |
| 10 | `stomatal_model` `["BWB", "BBL", "Medlyn", "BMF"]` | `enum` |  |  |  | editable |
| 11 | `bwb_gs0` | `float` | 0.0 | 1.0 | Ball-woodrow-berry _(when `stomatal_model` = `BWB`)_ | editable |
| 12 | `bwb_a1` | `float` | 0.0 | 50.0 | Ball-woodrow-berry _(when `stomatal_model` = `BWB`)_ | editable |
| 13 | `bbl_gs0` | `float` | 0.0 | 1.0 | Ball-berry-leuning _(when `stomatal_model` = `BBL`)_ | editable |
| 14 | `bbl_a1` | `float` | 0.0 | 50.0 | Ball-berry-leuning _(when `stomatal_model` = `BBL`)_ | editable |
| 15 | `bbl_d0` | `float` | 0.0 | 5000000.0 | Ball-berry-leuning _(when `stomatal_model` = `BBL`)_ | editable |
| 16 | `medlyn_gs0` | `float` | 0.0 | 1.0 | Medlyn Optimality _(when `stomatal_model` = `Medlyn`)_ | editable |
| 17 | `medlyn_g1` | `float` | 0.0 | 50.0 | Medlyn Optimality _(when `stomatal_model` = `Medlyn`)_ | editable |
| 18 | `bmf_em` | `float` | 0.0 | 50000.0 | Buckley-mott-farquhar _(when `stomatal_model` = `BMF`)_ | editable |
| 19 | `bmf_i0` | `float` | 0.0 | 10000.0 | Buckley-mott-farquhar _(when `stomatal_model` = `BMF`)_ | editable |
| 20 | `bmf_k` | `float` | 0.0 | 10000000.0 | Buckley-mott-farquhar _(when `stomatal_model` = `BMF`)_ | editable |
| 21 | `bmf_b` | `float` | 0.0 | 50000.0 | Buckley-mott-farquhar _(when `stomatal_model` = `BMF`)_ | editable |

### Visualiser

Visualisation colour, opacity and texture for scene rendering

| # | Property | Type | Min | Max | Group | Visibility |
|---|---|---|---|---|---|---|
| 89 | `texture_toggle` | `boolean` |  |  |  | editable |
| 90 | `color_r` | `integer` | 0.0 | 255.0 |  | editable |
| 91 | `color_g` | `integer` | 0.0 | 255.0 |  | editable |
| 92 | `color_b` | `integer` | 0.0 | 255.0 |  | editable |
| 93 | `opacity` | `integer` | 0.0 | 100.0 |  | editable |
| 94 | `texture_file` | `file` |  |  |  | editable |

!!! note "Visibility"
    The catalog endpoint returns only `editable` rows. `external` values are set elsewhere (the Weather panel, the project header); `computed` are produced by another model; `superseded` were replaced by newer properties. **Validation and apply keep every property regardless.**

## Weather data types & units

A **separate** catalog from the property system above — this one carries units and conversions. `value_in_base = value x to_base_factor + to_base_offset`.

### air_CO2

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `ppm` | **base** | 1.0 | 0.0 | 0.0 | 3000.0 |
| `kg/m³` |  | 555864.3690939411 | 0.0 |  | 0.005894 |
| `ppb` |  | 0.001 | 0.0 | 0.0 | 3000000.0 |

### air_humidity

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `0-1` | **base** | 1.0 | 0.0 | 0.0 | 1.0 |
| `0-100` |  | 0.01 | 0.0 | 0.0 | 100.0 |

### air_pressure

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `Pa` | **base** | 1.0 | 0.0 | 87000.0 | 150000.0 |
| `atm` |  | 101325.0 | 0.0 | 0.8586 | 1.4805 |
| `bar` |  | 100000.0 | 0.0 | 0.87 | 1.5 |
| `hPa` |  | 100.0 | 0.0 | 870.0 | 1500.0 |
| `kPa` |  | 1000.0 | 0.0 | 87.0 | 150.0 |
| `mmHg` |  | 133.322387415 | 0.0 | 652.55 | 1125.09 |

### air_temperature

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `K` | **base** | 1.0 | 0.0 | 223.0 | 350.0 |
| `C` |  | 1.0 | 273.15 | -50.15 | 76.85 |
| `F` |  | 0.5555555555555556 | 255.3722222222222 | -58.27 | 170.33 |

### beta_soil

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `0-1` | **base** | 1.0 | 0.0 | 0.0 | 1.0 |

### date_time

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `MM/DD/YYYY HH:MM` | **base** | 1.0 | 0.0 |  |  |
| `DD-MM-YYYY HH:MM` |  | 1.0 | 0.0 |  |  |
| `DD/MM/YYYY HH:MM` |  | 1.0 | 0.0 |  |  |
| `DOY YYYY HH:MM` |  | 1.0 | 0.0 |  |  |
| `MM-DD-YYYY HH:MM` |  | 1.0 | 0.0 |  |  |
| `YYYY DOY HH:MM` |  | 1.0 | 0.0 |  |  |
| `YYYY-MM-DD HH:MM` |  | 1.0 | 0.0 |  |  |
| `YYYY-MM-DDTHH:MM:SS-HH:MM` |  | 1.0 | 0.0 |  |  |
| `YYYY-MM-DDTHH:MM:SSZ` |  | 1.0 | 0.0 |  |  |
| `YYYYMMDDHH` |  | 1.0 | 0.0 |  |  |

### diffuse_horizontal_radiation_flux

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `W/m^2` | **base** | 1.0 | 0.0 | 0.0 | 1500.0 |
| `Wh/m^2` |  | 1.0 | 0.0 | 0.0 | 1500.0 |
| `kW/m^2` |  | 1000.0 | 0.0 | 0.0 | 1.5 |
| `kWh/m^2/day` |  | 41.66666666666667 | 0.0 | 0.0 | 36.0 |
| `umol/m^2/s` |  | 0.2188183807439825 | 0.0 | 0.0 | 6855.0 |

### direct_horizontal_radiation_flux

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `W/m^2` | **base** | 1.0 | 0.0 | 0.0 | 1500.0 |
| `Wh/m^2` |  | 1.0 | 0.0 | 0.0 | 1500.0 |
| `kW/m^2` |  | 1000.0 | 0.0 | 0.0 | 1.5 |
| `kWh/m^2/day` |  | 41.66666666666667 | 0.0 | 0.0 | 36.0 |
| `umol/m^2/s` |  | 0.2188183807439825 | 0.0 | 0.0 | 6855.0 |

### turbidity

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `0-1` | **base** | 1.0 | 0.0 | 0.0 | 1.0 |
| `>1` |  | 1.0 | 0.0 | 1.0 |  |

### wind_speed

| Unit | Base | Factor | Offset | Min | Max |
|---|---|---|---|---|---|
| `m/s` | **base** | 1.0 | 0.0 | 0.0 | 60.0 |
| `ft/s` |  | 0.3048 | 0.0 | 0.0 | 196.85 |
| `km/h` |  | 0.2777777777777778 | 0.0 | 0.0 | 216.0 |
| `knots` |  | 0.5144444444444445 | 0.0 | 0.0 | 116.63 |
| `mph` |  | 0.44704 | 0.0 | 0.0 | 134.22 |

## Related

- [The property system](../dev/arch/properties.md) — the mechanism.
- [Add a property to a type](../dev/recipes/add-property.md) — changing any of this.
