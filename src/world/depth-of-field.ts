/**
 * Depth of field, on the high quality tier only. The scene is drawn into an off-screen target with
 * its depth; a half-resolution pass gathers a soft copy of it, and a full-resolution pass mixes the
 * sharp and the soft by how far each pixel is from the subject in focus (its circle of confusion),
 * then writes the result to the screen.
 *
 * The subject's distance, the depth of the sharp zone around it and the strength of the blur come
 * from the beat's shot (shots.ts). A wide shot also blurs a band at the top and bottom of the frame
 * (`tilt`), for a gentle tilt-shift look. The sky (nothing drawn, depth 1) blurs only a little, so
 * points of light in front of it, such as the pixels rising after the merge, stay crisp.
 */
import {
  BufferGeometry,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import type { PerspectiveCamera, Scene, Texture, WebGLRenderer } from 'three';

/** What is in focus this frame: the subject's distance from the camera, and the shot's focus. */
export interface FocusState {
  distance: number;
  depth: number;
  blur: number;
  tilt: number;
}

export interface DepthOfField {
  render(scene: Scene, camera: PerspectiveCamera, focus: Readonly<FocusState>): void;
  /** Size in CSS pixels and the renderer's pixel ratio. */
  setSize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

/** The widest blur, as a fraction of the screen's height (in half-resolution pixels). */
const MAX_RADIUS = 0.0062;
/** How much the sky, where nothing was drawn, may blur at most. */
const SKY_BLUR = 0.3;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The circle of confusion at a point, 0 sharp to 1 fully blurred
const COC = /* glsl */ `
#include <packing>
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uDepthOfField;
uniform float uBlur;
uniform float uTilt;

float circleOfConfusion(vec2 uv) {
  float d = texture2D(uDepth, uv).x;
  float z = -perspectiveDepthToViewZ(d, uNear, uFar);
  float off = abs(z - uFocus);
  float coc = smoothstep(uDepthOfField, uDepthOfField + uFocus * 0.8, off);
  float band = uTilt * smoothstep(0.2, 0.5, abs(uv.y - 0.5));
  coc = max(coc, band);
  coc = mix(coc, min(coc, ${SKY_BLUR.toFixed(2)}), step(0.99999, d));
  return coc * uBlur;
}
`;

const GATHER = /* glsl */ `
uniform sampler2D uColor;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
${COC}
void main() {
  float centre = circleOfConfusion(vUv);
  vec3 sum = texture2D(uColor, vUv).rgb;
  float total = 1.0;
  // a golden-angle spiral of taps, reaching out to the widest blur
  for (int i = 0; i < 11; i++) {
    float f = float(i) + 0.5;
    float r = sqrt(f / 11.0);
    float a = f * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uRadius * centre * uTexel;
    // a sharp neighbour does not bleed into the blur around it
    float w = smoothstep(0.0, 0.25, circleOfConfusion(uv)) + 0.05;
    sum += texture2D(uColor, uv).rgb * w;
    total += w;
  }
  gl_FragColor = vec4(sum / total, centre);
}
`;

const COMPOSE = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uSoft;
varying vec2 vUv;
${COC}
void main() {
  vec3 sharp = texture2D(uColor, vUv).rgb;
  vec3 soft = texture2D(uSoft, vUv).rgb;
  float coc = circleOfConfusion(vUv);
  gl_FragColor = vec4(mix(sharp, soft, smoothstep(0.05, 0.45, coc)), 1.0);
  #include <colorspace_fragment>
}
`;

export function createDepthOfField(renderer: WebGLRenderer): DepthOfField {
  const depth = new DepthTexture(1, 1, UnsignedIntType);
  const sharp = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthTexture: depth });
  const soft = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });

  const focusUniforms = {
    uDepth: { value: depth as Texture },
    uNear: { value: 0.5 },
    uFar: { value: 2000 },
    uFocus: { value: 50 },
    uDepthOfField: { value: 10 },
    uBlur: { value: 0 },
    uTilt: { value: 0 },
  };
  const texel = new Vector2();
  const radius = { value: 4 };
  const gather = new ShaderMaterial({
    uniforms: {
      ...focusUniforms,
      uColor: { value: sharp.texture },
      uTexel: { value: texel },
      uRadius: radius,
    },
    vertexShader: VERTEX,
    fragmentShader: GATHER,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const compose = new ShaderMaterial({
    uniforms: {
      ...focusUniforms,
      uColor: { value: sharp.texture },
      uSoft: { value: soft.texture },
    },
    vertexShader: VERTEX,
    fragmentShader: COMPOSE,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });

  // one triangle that covers the screen
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new Mesh(geometry, gather);
  quad.frustumCulled = false;
  const screen = new OrthographicCamera();

  return {
    render(scene, camera, focus) {
      focusUniforms.uNear.value = camera.near;
      focusUniforms.uFar.value = camera.far;
      focusUniforms.uFocus.value = focus.distance;
      focusUniforms.uDepthOfField.value = focus.depth;
      focusUniforms.uBlur.value = focus.blur;
      focusUniforms.uTilt.value = focus.tilt;
      // Each pass goes to the GPU as a batch of its own: an integrated GPU's driver can reset a context
      // that hands it one long batch, and a reset loses the whole world.
      const gl = renderer.getContext();
      renderer.setRenderTarget(sharp);
      renderer.render(scene, camera);
      gl.flush();
      quad.material = gather;
      renderer.setRenderTarget(soft);
      renderer.render(quad, screen);
      gl.flush();
      quad.material = compose;
      renderer.setRenderTarget(null);
      renderer.render(quad, screen);
    },
    setSize(width, height, pixelRatio) {
      const w = Math.max(1, Math.round(width * pixelRatio));
      const h = Math.max(1, Math.round(height * pixelRatio));
      sharp.setSize(w, h);
      const sw = Math.max(1, Math.round(w / 2));
      const sh = Math.max(1, Math.round(h / 2));
      soft.setSize(sw, sh);
      texel.set(1 / sw, 1 / sh);
      radius.value = sh * MAX_RADIUS * 2;
    },
    dispose() {
      sharp.dispose();
      soft.dispose();
      depth.dispose();
      gather.dispose();
      compose.dispose();
      geometry.dispose();
    },
  };
}
