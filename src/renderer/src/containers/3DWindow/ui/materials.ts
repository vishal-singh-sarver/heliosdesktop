import * as THREE from 'three'

export type LightingMode = 'flat' | 'phong' | 'phong-shadows'

interface MaterialOptions {
  vertexColors?: boolean
  map?: THREE.Texture
  alphaTest?: number
  backfaceCulling?: boolean
}

export function createMaterial(lightingMode: LightingMode, options: MaterialOptions): THREE.Material {
  // Default to DoubleSide so thin geometry (leaves, patches) is visible from
  // both sides. FrontSide culling only when requested (e.g. ground tiles).
  const base: THREE.MeshPhongMaterialParameters = {
    side: options.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide
  }
  if (options.vertexColors) base.vertexColors = true
  if (options.map) base.map = options.map
  if (options.alphaTest) base.alphaTest = options.alphaTest

  if (lightingMode === 'flat') {
    return new THREE.MeshBasicMaterial(base as THREE.MeshBasicMaterialParameters)
  }
  return new THREE.MeshPhongMaterial({ ...base, shininess: 30 })
}

/**
 * Material for "color + texture mask" mode: the texture's alpha channel masks
 * (discards transparent pixels) while the fragment is colored with the vertex
 * color instead of the texture RGB. Textures without alpha (e.g. JPEG) render
 * fully opaque in the vertex color.
 */
export function createMaskMaterial(tex: THREE.Texture | null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      maskTexture: { value: tex }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vColor = color;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D maskTexture;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vNormal;
      void main() {
        vec4 texel = texture2D(maskTexture, vUv);
        if (texel.a < 0.5) discard;
        vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
        float diff = max(dot(vNormal, lightDir), 0.0);
        vec3 lit = vColor * (0.3 + 0.7 * diff);
        gl_FragColor = vec4(lit, 1.0);
      }
    `,
    vertexColors: true,
    side: THREE.DoubleSide
  })
}
