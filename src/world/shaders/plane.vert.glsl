// Flat layers (clouds, ground): pass the world position on so noise is fixed in the world
// even when the plane itself follows the camera.
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
