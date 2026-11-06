uniform vec3 uGlow;
uniform float uNight;
uniform float uGlowFrom; // local height above which an emitting prop glows (a lamp head)

varying vec3 vColor;
varying float vIndex;
varying float vEmit;
varying float vLocalY;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vCentre;
#ifdef FADE
flat varying float vClear;
#endif

void main() {
  float moon = max(dot(normalize(vNormal), normalize(MOON)), 0.0);
  vec3 col = shade(vColor, moon, uNight);
  float glow = vEmit * step(uGlowFrom, vLocalY) * smoothstep(0.1, 0.5, uNight);
  col = mix(col, uGlow, glow);
  col *= focusDim(vIndex);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
#ifdef FADE
  gl_FragColor.a = 1.0 - vClear;
#endif
  #include <colorspace_fragment>
}
