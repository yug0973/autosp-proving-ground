// A car's headlights on the road ahead: one flat quad per car, moving with it (traffic.glsl). Far
// away it is only a little light, so the quad is left out there and costs nothing.
attribute vec4 aLane;
attribute float aPhase;
attribute vec2 aShape;
uniform float uNight;

varying vec2 vBeam;
varying float vStrength;

const float BEAM_REACH = 90.0; // world units from the camera

void main() {
  vec2 forward;
  vec3 centre = carCentre(aLane, aPhase, forward);
  vec3 world = carToWorld(position + vec3(0.0, 0.0, aShape.x * 0.76), centre, forward);
  vec4 view = viewMatrix * vec4(world, 1.0);
  vBeam = uv;
  vStrength = smoothstep(0.1, 0.6, uNight) * (1.0 - smoothstep(BEAM_REACH * 0.6, BEAM_REACH, -view.z));
  gl_Position = -view.z > BEAM_REACH ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * view;
}
