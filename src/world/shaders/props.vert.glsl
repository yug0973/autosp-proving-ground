// Rooftop and street props (water tanks, spires, streetlight poles): instanced, with a colour,
// the index of the building they stand on (-1 for street furniture) and how much they glow.
attribute vec3 aColor;
attribute float aIndex;
attribute float aEmit;

varying vec3 vColor;
varying float vIndex;
varying float vEmit;
varying float vLocalY;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vCentre;
#ifdef FADE
flat varying float vClear; // how far this piece has cleared the camera's line of sight
#endif

void main() {
  vColor = aColor;
  vIndex = aIndex;
  vEmit = aEmit;
  vLocalY = position.y;
  vNormal = normalize(mat3(instanceMatrix) * normal);
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
#if defined(CLEARING) || defined(FADE)
  float clear = focusClearAmount(vCentre.xz, vec2(vCentre.y, vCentre.y + 2.0), 0.6, aIndex);
  if (!FOCUS_DRAWN(clear)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
#endif
#ifdef FADE
  vClear = clear;
#endif
}
