// A car: one instance per car, placed and turned by its lane (traffic.glsl).
attribute vec4 aLane;
attribute float aPhase;
attribute vec3 aPaint;
attribute vec2 aShape; // this vehicle's stretch of the one body: length, height

varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vNormal;
varying vec3 vPaint;
varying vec3 vWorld;

void main() {
  vec2 forward;
  vec3 centre = carCentre(aLane, aPhase, forward);
  vec3 world = carToWorld(vec3(position.x, position.y * aShape.y, position.z * aShape.x), centre, forward);
  vNormal = carToWorld(normal, vec3(0.0), forward);
  vLocal = position;
  vLocalNormal = normal;
  vPaint = aPaint;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
