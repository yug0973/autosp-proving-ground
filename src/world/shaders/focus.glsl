// The building the camera is pushing in on, shared by every part of a building (its masses,
// cornices, tanks and spire) so they clear, dim and stay together. Needs common.glsl and
// merge.glsl.
uniform float uFocusIndex; // the building's index, or -1
uniform float uFocus;      // how far the push has gone, 0 to 1
uniform vec3 uFocusTarget; // the point the camera looks at on it

float focusIs(float index) {
  return 1.0 - step(0.5, abs(index - uFocusIndex));
}

// the rest of the city steps back while the camera is on one building, and goes dark after the merge
float focusDim(float index) {
  float other = 1.0 - focusIs(index);
  return mix(1.0, 0.45, uFocus * other) * mix(1.0, loneDim(), other);
}
