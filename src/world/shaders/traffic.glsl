// Where a car is, in closed form: no state, so thousands cost nothing on the CPU and a car can
// never leave its lane. A lane is (axis: 0 along x, 1 along z; position across; direction; speed).
uniform float uTime;

vec3 carCentre(vec4 lane, float phase, out vec2 forward) {
  float len = lane.x < 0.5 ? LANE_LEN_X : LANE_LEN_Z;
  float s = (mod(phase + uTime * lane.w, len) - len * 0.5) * lane.z;
  forward = lane.x < 0.5 ? vec2(lane.z, 0.0) : vec2(0.0, lane.z);
  return lane.x < 0.5 ? vec3(s, 0.0, lane.y) : vec3(lane.y, 0.0, s);
}

// A car-local point (x across, y up, z forward) placed in the world
vec3 carToWorld(vec3 local, vec3 centre, vec2 forward) {
  vec2 across = vec2(forward.y, -forward.x);
  return centre + vec3(across.x * local.x + forward.x * local.z, local.y, across.y * local.x + forward.y * local.z);
}
