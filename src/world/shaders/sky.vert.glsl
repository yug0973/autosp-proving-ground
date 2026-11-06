// The sky dome is a large sphere that follows the camera; the direction of each vertex is the
// direction the fragment shader colours.
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
