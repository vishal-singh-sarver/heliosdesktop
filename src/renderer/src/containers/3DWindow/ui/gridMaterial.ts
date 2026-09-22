import * as THREE from 'three'

/**
 * The viewport grid's shader — three decades of lines, cross-faded.
 *
 * drei's `<Grid>`, which this replaces, draws exactly two fixed line spacings
 * passed in as uniforms. Feeding it a spacing derived from the camera makes the
 * grid adapt, but only in jumps: the spacing has to be rounded to something, and
 * on every rounding boundary a whole set of lines appears or vanishes at once.
 * Rounding to 1/2/5 keeps the jumps small (2-2.5x) but means a 10-unit ground
 * sits inside 2 or 5 cells depending on zoom, which is no use for reading a
 * dimension off the grid.
 *
 * Blender rounds to powers of ten instead — 0.1, 1, 10, 100 — so an object's
 * size always relates to a cell by a factor of ten. On its own that would be
 * worse, not better: a 10x jump between levels leaves the screen nearly empty
 * just after each transition. Blender gets away with it because it never shows
 * one level at a time. It draws the decade below, the decade itself and the
 * decade above together, fading the finest one out as the camera pulls back and
 * the next one takes over. Between two levels you see both, so the transition
 * has no step in it at all.
 *
 * That pairing is the whole design, and it is why this is a custom shader rather
 * than a tuning constant: decade steps and the cross-fade only work together.
 *
 * @see gridParamsForView in SceneHelpers.tsx for the level maths this consumes.
 */

const VERTEX = /* glsl */ `
  uniform vec2 gridOrigin;
  uniform float halfExtent;

  varying vec2 vWorld;

  void main() {
    // The quad is built directly in world space rather than through the model
    // matrix, so it can be re-centred under the camera every frame without a
    // matrix inverse in the shader, and so the fragment stage gets plain world
    // XY to draw lines against. The plane is the world's z = 0.
    vec2 world = position.xy * halfExtent + gridOrigin;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 0.0, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec2 gridOrigin;
  uniform vec2 gridPhase;
  uniform float level;
  uniform float fadeDistance;
  uniform float fadeStrength;
  uniform float cellThickness;
  uniform float sectionThickness;
  uniform vec3 cellColor;
  uniform vec3 sectionColor;

  varying vec2 vWorld;

  // Coverage of one set of grid lines, antialiased to a constant pixel width by
  // dividing the distance-to-line by its screen-space derivative.
  float gridCoverage(vec2 p, float size, float thickness) {
    vec2 r = p / size;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    return 1.0 - min(min(grid.x, grid.y) + 1.0 - thickness, 1.0);
  }

  void main() {
    float lo = floor(level);
    float blend = level - lo;
    float fine = pow(10.0, lo);

    // Lines are drawn against a position measured from the camera rather than
    // from the world origin. A float32 carries ~7 digits, so at a world
    // coordinate of 1000000 (the ground size that started all this) fract()
    // loses the fractional part entirely and the grid tears into noise.
    // gridPhase carries the camera's offset within one period of the coarsest
    // decade, computed in double precision on the CPU. Because the three
    // spacings are decades of each other, one phase keeps all three locked to
    // the true world grid while the numbers reaching fract() stay small.
    vec2 p = vWorld - gridOrigin + gridPhase;

    // The finest decade fades out as the camera pulls back; the next two carry
    // the grid while it goes. That overlap is what removes the step.
    float gFine = gridCoverage(p, fine, cellThickness) * (1.0 - blend);
    float gMid = gridCoverage(p, fine * 10.0, cellThickness);
    float gCoarse = gridCoverage(p, fine * 100.0, sectionThickness);

    vec3 color = cellColor;
    float alpha = max(gFine, gMid);

    // Every hundredth line is the section line — twice as thick, and given its
    // own colour, so the eye has something to count in tens against.
    color = mix(color, sectionColor, min(1.0, gCoarse));
    alpha = max(alpha, gCoarse);

    // Fade to nothing at fadeDistance from the point below the camera, so the
    // grid has no visible edge. AdaptiveClipping sizes the far plane from this
    // same radius.
    float falloff = 1.0 - min(distance(gridOrigin, vWorld) / fadeDistance, 1.0);
    alpha *= pow(falloff, fadeStrength);
    if (alpha <= 0.0) discard;

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** How many decades of lines the shader draws at once. Fixed by the shader. */
export const GRID_DECADES = 3

export interface GridMaterialColors {
  cell: string
  section: string
}

export function createGridMaterial(colors: GridMaterialColors): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Visible from below too — the camera is allowed all the way under the
    // ground (maxPolarAngle is PI), and a grid that vanishes down there reads
    // as a bug.
    side: THREE.DoubleSide,
    // Push the grid's depth back so ground geometry sitting exactly on z = 0
    // occludes it instead of fighting with it, and keep it out of the depth
    // buffer so it never occludes anything itself.
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4,
    depthWrite: false,
    uniforms: {
      gridOrigin: { value: new THREE.Vector2() },
      gridPhase: { value: new THREE.Vector2() },
      level: { value: 0 },
      halfExtent: { value: 1 },
      fadeDistance: { value: 100 },
      fadeStrength: { value: 1.5 },
      cellThickness: { value: 0.6 },
      sectionThickness: { value: 1.2 },
      cellColor: { value: new THREE.Color(colors.cell) },
      sectionColor: { value: new THREE.Color(colors.section) }
    }
  })
  return material
}

/**
 * Point the grid at the camera for this frame.
 *
 * @param level continuous decade level; the finest lines drawn are 10^floor(level)
 *   and `level - floor(level)` is how far they have faded out.
 * @param fadeDistance radius at which the grid reaches zero alpha.
 */
export function updateGridMaterial(
  material: THREE.ShaderMaterial,
  cameraX: number,
  cameraY: number,
  level: number,
  fadeDistance: number
): void {
  const uniforms = material.uniforms
  uniforms.level.value = level
  uniforms.fadeDistance.value = fadeDistance
  // The quad's half-width. A square of this half-extent contains the fade disc
  // of the same radius, so the grid always fades out before the quad ends.
  uniforms.halfExtent.value = fadeDistance
  ;(uniforms.gridOrigin.value as THREE.Vector2).set(cameraX, cameraY)

  // One period of the coarsest decade the shader draws. Reduced here, in
  // doubles, because the shader's float32 cannot do it at world scale.
  const period = Math.pow(10, Math.floor(level)) * 100
  ;(uniforms.gridPhase.value as THREE.Vector2).set(
    cameraX - Math.floor(cameraX / period) * period,
    cameraY - Math.floor(cameraY / period) * period
  )
}
