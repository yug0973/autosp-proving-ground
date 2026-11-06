// A gate: a flat barrier facing along the fix's path. The fragment shader draws it as a grid of
// lit square pixels, measured in world units across the barrier.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
