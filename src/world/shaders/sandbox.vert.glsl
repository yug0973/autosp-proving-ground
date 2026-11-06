// The sandbox: a unit box scaled to uSize. Each face passes its own size and a position on it in
// world units, so its edges and its dot grid are measured the same on every face.
uniform vec3 uSize;

varying vec2 vUv;
varying vec2 vFace;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normal;
  if (abs(n.x) > 0.5) vFace = uSize.zy;
  else if (abs(n.z) > 0.5) vFace = uSize.xy;
  else vFace = uSize.xz;
  vUv = uv * vFace;
  vNormal = normalize(mat3(modelMatrix) * n);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
