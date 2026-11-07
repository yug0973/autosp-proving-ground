// A gate: a flat barrier facing along the fix's path. The fragment shader draws it as a grid of
// lit square pixels, measured in world units across the barrier.
varying vec2 vUv;
varying float vDepth; // how far in front of the camera, so a barrier the camera flies through parts

void main() {
  vUv = uv;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
