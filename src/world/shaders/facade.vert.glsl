// A building is a stack of boxes (its masses, setbacks and cornices), one instance each. The
// unit box sits on y = 0; the instance matrix scales it to the tier and lifts it to its base.
// Window rows are measured from the ground, so floors line up from one setback to the next.
attribute vec3 aSize;   // the tier's width (x), height and depth (z)
attribute float aY0;    // the height of the tier's base
attribute float aSeed;  // the building's seed
attribute float aState; // 0 quiet, 1 open finding, 2 sealed; negative for the results' row (skyline.ts)
attribute float aIndex; // the building's index, shared by all its tiers
attribute float aStyle; // 0 brick, 1 stone, 2 glass, 3 deco, 4 trim
attribute float aTier;  // 0 for the street-level mass
attribute vec4 aDisplays; // the facade display slot on this tier's +x, -x, +z and -z faces, or -1 (display.ts)

// Everything that is the same across a whole tier or face is passed `flat`: an interpolated
// constant comes back off by a rounding error, and the window hashes amplify that into speckle.
varying vec2 vUv;         // walls: along the face from its left corner, and world height; roofs: plan
flat varying float vDisplay; // the display slot on this face, or -1
flat varying vec2 vFace;  // the face's width and the tier's height
flat varying float vY0;
varying float vRoof;
flat varying float vFaceId;
flat varying float vSeed;
flat varying float vState;
flat varying float vIndex;
flat varying float vStyle;
flat varying float vTier;
varying vec3 vNormal;
varying vec3 vWorld;
flat varying vec2 vAxis;   // the tier's centre in plan, for clearing the camera's line of sight
flat varying vec2 vSpan;   // its base and top heights
flat varying float vReach; // half its widest side
#ifdef FADE
flat varying float vClear; // how far this piece has cleared the camera's line of sight
#endif

void main() {
  vec3 scaled = position * aSize;
  vec3 half_ = aSize * 0.5;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vRoof = step(0.5, abs(normal.y));
  if (abs(normal.x) > 0.5) {
    vUv = vec2(scaled.z * normal.x + half_.z, world.y);
    vFace = vec2(aSize.z, aSize.y);
    vFaceId = normal.x > 0.0 ? 1.0 : 2.0;
  } else if (abs(normal.z) > 0.5) {
    vUv = vec2(-scaled.x * normal.z + half_.x, world.y);
    vFace = vec2(aSize.x, aSize.y);
    vFaceId = normal.z > 0.0 ? 3.0 : 4.0;
  } else {
    vUv = scaled.xz + half_.xz;
    vFace = aSize.xz;
    vFaceId = 0.0;
  }
  // set on the CPU only when a display is placed, so no work here (and none in the fragment
  // shader for a face without one)
  vDisplay = vFaceId < 0.5 ? -1.0 : vFaceId < 1.5 ? aDisplays.x : vFaceId < 2.5 ? aDisplays.y : vFaceId < 3.5 ? aDisplays.z : aDisplays.w;
  vY0 = aY0;
  vSeed = aSeed;
  vState = aState;
  vIndex = aIndex;
  vStyle = aStyle;
  vTier = aTier;
  vNormal = normal; // boxes are never rotated
  vWorld = world.xyz;
  vAxis = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  vSpan = vec2(aY0, aY0 + aSize.y);
  vReach = max(aSize.x, aSize.z) * 0.5;
  gl_Position = projectionMatrix * viewMatrix * world;
#if defined(CLEARING) || defined(FADE)
  float clear = focusClearAmount(vAxis, vSpan, vReach, aIndex);
  if (!FOCUS_DRAWN(clear)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
#endif
#ifdef FADE
  vClear = clear;
#endif
}
