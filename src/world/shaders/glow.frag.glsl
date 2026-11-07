// The halo follows the crack's story exactly as the facade does: orange while open, gone where
// the patch has been written, lime (held low until the merge) once sealed, and a flare when the
// reproduction test fails. Other buildings' halos step back with them while one is in focus.
uniform vec3 uOpen;
uniform vec3 uSealed;
uniform float uNight;
uniform float uTime;
uniform float uPulse;
uniform float uPatch;
uniform float uSeal;
uniform float uMerge;

varying float vIndex;
varying float vFrac;
varying float vSeed;
varying float vX;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.0, 1.0, d);
  soft *= soft;
  float isFocus = focusIs(vIndex);
  float sealed = isFocus * step(0.5, uSeal);
  // the patch covers the crack from 12% to 96% of the way up as it is written
  float patchLine = mix(0.12, 0.96, uPatch);
  float patched = isFocus * step(0.001, uPatch) * (1.0 - step(patchLine, vFrac)) * (1.0 - sealed);
  float flicker = 0.75 + 0.25 * sin(uTime * 3.1 + vSeed * 40.0);
  vec3 colour = mix(uOpen * flicker, uSealed * mix(0.38, 1.0, uMerge), sealed);
  float flare = 1.0 + 2.2 * exp(-uPulse * 3.0) * isFocus * (1.0 - sealed);
  float strength = 0.3 * soft * flare * (1.0 - patched) * smoothstep(0.15, 0.7, uNight) * focusDim(vIndex) * scanIgnite(vX); // dark until the sweep reaches it
  gl_FragColor = vec4(colour, strength * crackLift(vIndex));
  #include <colorspace_fragment>
}
