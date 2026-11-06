uniform vec3 uHeadlight;
uniform vec3 uTaillight;
uniform vec3 uWindowDark;
uniform vec3 uStreetLight;
uniform vec3 uSky;
uniform float uNight;

varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vNormal;
varying vec3 vPaint;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);
  vec3 ln = normalize(vLocalNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  float moon = max(dot(n, normalize(MOON)), 0.0);
  vec3 col = shade(vPaint, moon, uNight) * mix(1.0, 1.25, uNight);
  // paint is glossy: it catches the sky on top and more of it at a glancing angle, and the
  // streetlights slide along it as a soft band
  float gloss = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  col += uSky * (0.1 * max(n.y, 0.0) + 0.22 * gloss);
  col += uStreetLight * 0.1 * uNight * max(n.y, 0.0) * smoothstep(0.55, 1.0, sin((vWorld.x + vWorld.z) * 0.52) * 0.5 + 0.5);

  // The glass: the sloped windscreen and rear window, and the side windows, with a pillar between
  float upper = step(0.385, vLocal.y) * (1.0 - step(0.625, vLocal.y));
  float sloped = upper * step(0.15, abs(ln.z)) * step(0.1, ln.y) * step(abs(ln.x), 0.5);
  float pillar = 1.0 - step(0.022, abs(vLocal.z + 0.11));
  float sides = upper * step(0.5, abs(ln.x)) * step(vLocal.y - 0.385, 0.2) * (1.0 - pillar)
              * step(-0.5, vLocal.z) * step(vLocal.z, 0.3);
  float glass = max(sloped, sides);
  col = mix(col, uWindowDark * 1.3 + uSky * (0.1 + 0.3 * gloss), glass);

  // a dark sill along the bottom, and the tyres, with a pale hub
  col *= 1.0 - 0.55 * (1.0 - smoothstep(0.1, 0.17, vLocal.y));
  float tyre = step(0.312, abs(vLocal.x));
  float hub = 1.0 - smoothstep(0.03, 0.06, length(vec2(vLocal.y - 0.115, mod(vLocal.z + 0.48 + 0.48, 0.96) - 0.48)));
  col = mix(col, uWindowDark * 0.45 + uSky * 0.03 + uStreetLight * 0.12 * hub * step(0.5, abs(ln.x)), tyre);

  // lamps: two at the front, two at the back, on the outer corners
  float lampRow = step(0.17, vLocal.y) * (1.0 - step(0.3, vLocal.y)) * step(0.16, abs(vLocal.x)) * (1.0 - tyre);
  float front = step(0.5, ln.z) * lampRow;
  float rear = step(0.5, -ln.z) * lampRow;
  float on = mix(0.35, 1.0, uNight);
  col = mix(col, uHeadlight, front * on);
  col = mix(col, uTaillight * 1.5, rear * on);
  col *= loneDim();
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <colorspace_fragment>
}
