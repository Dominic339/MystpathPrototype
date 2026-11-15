// Sky dome and the day-night lighting rig, driven by the game clock.

import * as THREE from 'three';
import { calendar } from '../sim/time';

export interface SkyState {
  sunDir: THREE.Vector3;
  lightDir: THREE.Vector3; // sun by day, moon by night
  lightColor: THREE.Color;
  lightIntensity: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  night: number; // 0 day … 1 full night
  exposure: number;
}

const DAY_ZENITH = new THREE.Color('#2560bd');
const DAY_HORIZON = new THREE.Color('#a8c7e4');
const GOLD_ZENITH = new THREE.Color('#3d5c9e');
const GOLD_HORIZON = new THREE.Color('#f0a86e');
const NIGHT_ZENITH = new THREE.Color('#040814');
const NIGHT_HORIZON = new THREE.Color('#152340');

const SUN_DAY = new THREE.Color('#fff1dc');
const SUN_GOLD = new THREE.Color('#ffb070');
const MOON = new THREE.Color('#9db4e8');

/** Sun direction for a time of day. Rises in the east (+X), sets in the west (-X), arcs south. */
export function skyState(totalSeconds: number): SkyState {
  const cal = calendar(totalSeconds);
  // Angle around the full cycle: 0 = sunrise, π = sunset, 2π = next sunrise.
  const angle = cal.isDay ? cal.phaseProgress * Math.PI : Math.PI + cal.phaseProgress * Math.PI;
  const maxElev = THREE.MathUtils.degToRad(62);
  const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle) * Math.sin(maxElev), -Math.sin(angle) * Math.cos(maxElev) * 0.55).normalize();
  const elev = sunDir.y; // -1..1

  const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.22);
  const golden = 1 - THREE.MathUtils.smoothstep(Math.abs(elev), 0.06, 0.48);
  const night = 1 - THREE.MathUtils.smoothstep(elev, -0.22, 0.02);

  const zenith = NIGHT_ZENITH.clone().lerp(DAY_ZENITH, day).lerp(GOLD_ZENITH, golden * 0.5 * (1 - night));
  const horizon = NIGHT_HORIZON.clone().lerp(DAY_HORIZON, day).lerp(GOLD_HORIZON, golden * 0.75 * (1 - night * 0.7));

  const moonDir = sunDir.clone().multiplyScalar(-1);
  const useMoon = elev < -0.02;
  const lightDir = useMoon ? moonDir : sunDir;
  const lightColor = useMoon ? MOON.clone() : SUN_DAY.clone().lerp(SUN_GOLD, golden);
  const lightIntensity = useMoon ? 0.75 * THREE.MathUtils.smoothstep(-elev, 0.02, 0.25) : 3.6 * THREE.MathUtils.smoothstep(elev, -0.02, 0.18);

  const hemiSky = zenith.clone().lerp(new THREE.Color('#ffffff'), 0.25);
  const hemiGround = new THREE.Color('#4a3f2c').lerp(NIGHT_ZENITH, night * 0.8);
  const hemiIntensity = 0.28 + day * 0.42;

  return {
    sunDir,
    lightDir,
    lightColor,
    lightIntensity,
    zenith,
    horizon,
    hemiSky,
    hemiGround,
    hemiIntensity,
    fogColor: horizon.clone().lerp(zenith, 0.1),
    night,
    exposure: 0.9 + night * 0.45,
  };
}

export function buildSky(): { mesh: THREE.Mesh; update: (s: SkyState) => void } {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uNight: { value: 0 },
    uSunColor: { value: new THREE.Color() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uNight;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
        col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, h));

        // Sun glow and disc.
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6) * (1.0 - uNight);
        col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 18.0 * (1.0 - uNight);

        // Moon disc opposite the sun.
        float md = max(dot(d, -uSunDir), 0.0);
        col += vec3(0.75, 0.82, 1.0) * smoothstep(0.9990, 0.9994, md) * 3.0 * uNight;
        col += vec3(0.25, 0.32, 0.5) * pow(md, 24.0) * 0.25 * uNight;

        // Stars.
        vec3 g = floor(d * 380.0);
        float s = hash(g);
        float star = step(0.9975, s) * smoothstep(0.0, 0.25, h) * uNight;
        col += vec3(0.9, 0.93, 1.0) * star * (0.6 + 0.8 * fract(s * 91.0));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';
  return {
    mesh,
    update: (s) => {
      uniforms.uSunDir.value.copy(s.sunDir);
      uniforms.uZenith.value.copy(s.zenith);
      uniforms.uHorizon.value.copy(s.horizon);
      uniforms.uNight.value = s.night;
      uniforms.uSunColor.value.copy(s.lightColor);
    },
  };
}
