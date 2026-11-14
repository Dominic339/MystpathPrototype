// Entry point: sets up rendering and input on the main thread and starts the simulation worker.
//
// URL parameters (handy for screenshots and testing):
//   seed=<n>         world seed
//   t=<seconds>      starting game time (0 = sunrise, 300 = noon, 600 = sunset, 900 = midnight)
//   speed=<n>        game speed multiplier (0 pauses)
//   warm=<seconds>   simulate this much before showing (villagers spread out)
//   cam=x,z,yaw,pitch,distance
//   hex=1            show the hex grid
//   q=low            skip ambient occlusion
//   ui=0             hide the HUD

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Heightfield } from './sim/terrain';
import { calendar, CYCLE_SECONDS, DAY_SECONDS } from './sim/time';
import type { FromSim, ToSim } from './sim/protocol';
import { buildTerrain } from './render/terrainMesh';
import { buildWater } from './render/water';
import { buildSky, skyState } from './render/sky';
import { buildVegetation } from './render/vegetation';
import { buildGrass } from './render/grass';
import { buildCamp, type CampBuild } from './render/camp';
import { buildVillagers, type VillagerView } from './render/villagers';
import { buildAirship } from './render/airship';
import { buildHexOverlay } from './render/hexOverlay';
import { CameraRig } from './render/cameraRig';
import { globalUniforms } from './render/materials';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const seed = num('seed', 20261114);
const startSeconds = num('t', DAY_SECONDS * 0.32);
const startSpeed = num('speed', 1);
const lowQuality = params.get('q') === 'low';
const showUi = params.get('ui') !== '0';

// ---------- renderer ----------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 9000);
const defaultPose = [-30, 14, 0.75, 0.62, 70];
const camParts = (params.get('cam') ?? '').split(',').map(Number);
const pose = camParts.length === 5 && camParts.every(Number.isFinite) ? camParts : defaultPose;
const rig = new CameraRig(camera, renderer.domElement, { x: pose[0], z: pose[1], yaw: pose[2], pitch: pose[3], distance: pose[4] });

const sky = buildSky();
scene.add(sky.mesh);
scene.fog = new THREE.FogExp2('#b9d5ec', 0.0013);

const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 600;
const SH = 110;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#bcd4f0', '#4a3f2c', 0.8);
scene.add(hemi);

// ---------- post-processing ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let gtao: GTAOPass | null = null;
if (!lowQuality) {
  gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 12 });
  gtao.blendIntensity = 0.85;
  // Transparent effects (smoke, flames, water) must not write into the AO normal/depth pass.
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (r, w, rb, dt, mask) => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.visible && (o.userData.noAO || (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).transparent)) {
        o.visible = false;
        hidden.push(o);
      }
    });
    gtaoRender(r, w, rb, dt, mask);
    hidden.forEach((o) => (o.visible = true));
  };
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.6, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- simulation ----------
const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToSim) => worker.postMessage(msg);

let terrain: Heightfield | null = null;
let water: ReturnType<typeof buildWater> | null = null;
let camp: CampBuild | null = null;
let villagers: VillagerView | null = null;
let hexOverlay: THREE.LineSegments | null = null;
const airship = buildAirship();
scene.add(airship.group);

let simSeconds = startSeconds;
let simSpeed = startSpeed;
let lastTickAt = performance.now();
let framesSinceWorld = -1;

worker.onmessage = (e: MessageEvent<FromSim>) => {
  const msg = e.data;
  if (msg.type === 'world') {
    const t = msg.terrain;
    terrain = new Heightfield(t.res, t.size, t.heights, t.waterLevel);
    const built = buildTerrain(terrain, msg.camp, msg.props);
    scene.add(built.mesh);
    scene.add(buildGrass(terrain, built.mesh, built.grassWeight));
    water = buildWater(terrain);
    scene.add(water.mesh);
    scene.add(buildVegetation(msg.props, terrain));
    camp = buildCamp(msg.camp, terrain);
    scene.add(camp.group);
    villagers = buildVillagers(
      msg.villagers.map((v) => v.look),
      terrain,
    );
    scene.add(villagers.group);
    hexOverlay = buildHexOverlay(terrain);
    hexOverlay.visible = params.get('hex') === '1';
    scene.add(hexOverlay);
    rig.setTerrain(terrain);
    framesSinceWorld = 0;
  } else if (msg.type === 'tick') {
    simSeconds = msg.totalSeconds;
    simSpeed = msg.speed;
    lastTickAt = performance.now();
    villagers?.setTargets(msg.villagers);
  } else if (msg.type === 'saved') {
    const blob = new Blob([msg.json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mystpath-save-${Date.now()}.json`;
    a.click();
  }
};
send({ type: 'init', seed, startSeconds, speed: startSpeed, warmup: num('warm', 0) });

// ---------- input ----------
const SPEEDS = [0, 1, 10, 60];
window.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') send({ type: 'setSpeed', speed: SPEEDS[Number(e.key) - 1] });
  if (e.key === ' ') send({ type: 'setSpeed', speed: simSpeed === 0 ? 1 : 0 });
  if (e.key.toLowerCase() === 'h' && hexOverlay) hexOverlay.visible = !hexOverlay.visible;
  if (e.key.toLowerCase() === 't') send({ type: 'setTime', totalSeconds: simSeconds + CYCLE_SECONDS / 8 });
  if (e.key.toLowerCase() === 'p') send({ type: 'save' });
});

// ---------- HUD ----------
const hud = document.getElementById('hud')!;
hud.style.display = showUi ? 'block' : 'none';
function clockText(totalSeconds: number): string {
  const c = calendar(totalSeconds);
  // Map the cycle to a 24h clock with sunrise at 06:00 and sunset at 18:00.
  const hours = ((c.cycleSeconds / CYCLE_SECONDS) * 24 + 6) % 24;
  const hh = Math.floor(hours).toString().padStart(2, '0');
  const mm = Math.floor((hours % 1) * 60).toString().padStart(2, '0');
  return `<b>${c.isDay ? 'Day' : 'Night'} ${c.dayIndex + 1}</b> · ${hh}:${mm} · ${c.season}, day ${c.dayOfSeason} · Year ${c.year}`;
}

// ---------- frame loop ----------
const clock = new THREE.Clock();
let realTime = 0;
function frame(): void {
  const dt = Math.min(0.1, clock.getDelta());
  realTime += dt;
  // Interpolate game time between simulation ticks.
  const gameSeconds = simSeconds + ((performance.now() - lastTickAt) / 1000) * simSpeed;
  globalUniforms.uTime.value = realTime;

  const s = skyState(gameSeconds);
  sky.update(s);
  rig.update(dt);
  const pivot = rig.pivot;
  sun.position.copy(pivot).addScaledVector(s.lightDir, 300);
  sun.target.position.copy(pivot);
  sun.color.copy(s.lightColor);
  sun.intensity = s.lightIntensity;
  hemi.color.copy(s.hemiSky);
  hemi.groundColor.copy(s.hemiGround);
  hemi.intensity = s.hemiIntensity;
  (scene.fog as THREE.FogExp2).color.copy(s.fogColor);
  renderer.toneMappingExposure = s.exposure;
  if (water) {
    const u = water.uniforms;
    u.uSunDir.value.copy(s.lightDir);
    u.uSunColor.value.copy(s.lightColor).multiplyScalar(Math.max(0.15, Math.min(1, s.lightIntensity / 2.5)));
    u.uSkyZenith.value.copy(s.zenith);
    u.uSkyHorizon.value.copy(s.horizon);
    u.uLight.value = Math.max(0.12, Math.min(1, s.lightIntensity / 2.5 + s.hemiIntensity * 0.35));
    u.uFogColor.value.copy(s.fogColor);
    u.uFogDensity.value = (scene.fog as THREE.FogExp2).density;
  }

  camp?.update(realTime, s.night);
  villagers?.update(dt, realTime);
  airship.update(gameSeconds, s.night);

  composer.render(dt);
  if (showUi) hud.innerHTML = `${clockText(gameSeconds)}<br><span class="quiet">Speed ${simSpeed}× · 1–4 speed · Space pause · T skip time · H hex grid · WASD/QE/drag/wheel camera</span>`;

  if (framesSinceWorld >= 0 && ++framesSinceWorld === 8) (window as unknown as { __mystReady: boolean }).__mystReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
