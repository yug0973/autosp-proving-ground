uniform vec3 uHeadlight;
varying vec2 vBeam; // x across, y from the bumper (0) to the far end (1)
varying float vStrength;

void main() {
  // two pools merging ahead of the car, spreading and fading as they go
  float spread = mix(0.2, 0.5, vBeam.y);
  float across = 1.0 - smoothstep(spread * 0.4, spread, abs(vBeam.x - 0.5));
  float along = smoothstep(0.0, 0.12, vBeam.y) * pow(1.0 - vBeam.y, 1.6);
  gl_FragColor = vec4(uHeadlight, across * along * 0.32 * vStrength * loneDim());
  #include <colorspace_fragment>
}
