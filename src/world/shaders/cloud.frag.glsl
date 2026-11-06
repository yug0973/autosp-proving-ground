uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
uniform float uLayerY;
uniform float uOpacity;
uniform float uTime;
uniform float uScale;
varying vec3 vWorld;

float fbm(vec2 p) {
  float amplitude = 0.5;
  float sum = 0.0;
  for (int i = 0; i < OCTAVES; i++) {
    sum += amplitude * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec2 p = vWorld.xz * uScale + vec2(uTime * 0.012, uTime * 0.004);
  float density = fbm(p);
  float cover = smoothstep(0.34, 0.58, density);
  // light from one side: compare density with a nudged sample so edges facing it read brighter
  float lit = clamp((density - fbm(p + vec2(0.06, 0.04))) * 5.0 + 0.5, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, lit);
  float dist = length(vWorld.xz - uCamPos.xz);
  // Toward its far edge a deck takes on the horizon's colour and thins out, finishing before the
  // edge itself. Seen almost edge-on (a grazing view), a deck compresses its brightest texture
  // into a bright stripe across the sky, so it fades out there too.
  col = mix(col, uFogColor, smoothstep(160.0, 360.0, dist));
  float edgeFade = 1.0 - smoothstep(220.0, 400.0, dist);
  vec3 view = vWorld - uCamPos;
  float grazing = abs(view.y) / max(length(view), 1.0);
  edgeFade *= smoothstep(0.02, 0.11, grazing);
  // a layer dissolves as the camera nears its height, so flying through never shows a hard cut
  float nearFade = smoothstep(2.0, 20.0, abs(uCamPos.y - uLayerY));
  gl_FragColor = vec4(col, cover * uOpacity * edgeFade * nearFade);
  #include <colorspace_fragment>
}
