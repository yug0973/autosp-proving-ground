// The soft glow in the air around a streetlight's head. Close ones are a little halo; far ones fade
// out, since the fog and the pools of light on the road already carry them.
uniform float uScale;
uniform float uNight;
varying float vFade;

const float HALO_REACH = 120.0; // world units from the camera

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float dist = -view.z;
  vFade = smoothstep(0.15, 0.6, uNight) * (1.0 - smoothstep(HALO_REACH * 0.5, HALO_REACH, dist));
  gl_PointSize = clamp(uScale / max(dist, 1.0), 2.0, 44.0);
  gl_Position = dist > HALO_REACH ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * view;
}
