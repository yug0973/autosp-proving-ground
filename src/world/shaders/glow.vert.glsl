// Halos beside a crack: soft points just off each wall of a cracked building's street-level mass,
// so open cracks and sealed pixels glow into the air around them without a bloom pass.
attribute float aIndex; // the building
attribute float aFrac;  // height up the mass, 0 to 1 (the patch is written from the bottom up)
attribute float aSeed;
uniform float uScale;

varying float vIndex;
varying float vFrac;
varying float vSeed;
varying float vX; // world x, for the scanner sweep (scan.glsl)

void main() {
  vIndex = aIndex;
  vFrac = aFrac;
  vSeed = aSeed;
  vX = (modelMatrix * vec4(position, 1.0)).x;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uScale * (0.75 + aSeed * 0.5) / max(-view.z, 1.0), 0.0, 140.0);
  gl_Position = projectionMatrix * view;
}
