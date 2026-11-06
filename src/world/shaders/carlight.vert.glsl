// A car's lamp as a glowing point: four per car, moving with it (traffic.glsl), so at night
// the avenues fill with streams of white headlights and dim red tail lights.
attribute vec4 aLane;
attribute float aPhase;
attribute vec3 aOffset; // car-local position of the lamp
attribute float aKind;  // 0 headlight, 1 tail light
uniform float uScale;
uniform float uNight;

varying float vKind;
varying float vFade;

void main() {
  vec2 forward;
  vec3 centre = carCentre(aLane, aPhase, forward);
  vec3 world = carToWorld(aOffset, centre, forward);
  vec4 view = viewMatrix * vec4(world, 1.0);
  float dist = -view.z;
  vKind = aKind;
  vFade = exp(-dist * 0.0045) * smoothstep(0.05, 0.6, uNight);
  // capped, so a car passing right under the camera cannot flood the screen with glow
  // never smaller than a couple of pixels, so far traffic still reads as streams of light
  gl_PointSize = clamp(uScale * mix(1.0, 0.65, aKind) / max(dist, 1.0), 2.2, 22.0);
  gl_Position = projectionMatrix * view;
}
