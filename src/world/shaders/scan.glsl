// The scanner sweep (scan.ts): a plane of world x that moves across the city. Cracks behind it are
// lit; ahead of it they are dark. Included in the facade and street shaders after common.glsl.
uniform float uScanX;     // where the line is; 1e4 once it has passed everything
uniform float uScanOn;    // 1 while it moves
uniform vec3 uScanColor;  // the Nexarise lit pixel: neutral, so it is not mistaken for a finding
uniform vec3 uScanShape;  // half width of the line, length of its glow, softness of the ignition
uniform float uEmbers;    // the first view: the findings burn before the line has come

// 0 ahead of the line, 1 once a crack at `x` is a little way behind it
float scanIgnite(float x) {
  return max(smoothstep(0.0, uScanShape.z, uScanX - x), uEmbers);
}

// The line and a faint glow either side of it, to add to a surface. `nx` is the x of the surface's
// normal: a wall that faces along x lies inside the plane from edge to edge, so it would light all at
// once as a slab, not a line. It is held back, so the line shows on roofs, roads and the other walls.
vec3 scanLight(float x, float nx) {
  float d = abs(x - uScanX);
  float line = 1.0 - smoothstep(uScanShape.x * 0.5, uScanShape.x, d);
  float glow = exp(-d / uScanShape.y) * 0.3;
  return uScanColor * (line * 1.5 + glow) * uScanOn * (1.0 - 0.9 * abs(nx));
}
