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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Heightfield } from './sim/terrain';
import { calendar, CYCLE_SECONDS, DAY_SECONDS } from './sim/time';
import { VILLAGER_STRIDE, type FromSim, type ToSim } from './sim/protocol';
import { buildTerrain } from './render/terrainMesh';
import { WaterSystem } from './render/water';
import { buildBoat, type BoatView } from './render/boat';
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
// Phones and tablets get lighter graphics (testing support only; the game targets PC).
const touchDevice = window.matchMedia('(pointer: coarse)').matches;
const lowQuality = params.get('q') === 'low' || touchDevice;
const showUi = params.get('ui') !== '0';

// ---------- renderer ----------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQuality ? 1.5 : 2));
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
sun.shadow.mapSize.setScalar(lowQuality ? 2048 : 4096);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 600;
const SH = 110;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#bcd4f0', '#4a3f2c', 0.8);
scene.add(hemi);

// Image-based lighting: the sky is rendered into an environment map (refreshed as the
// time of day changes), giving soft, directional fill light and sky reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(sky.mesh.geometry, sky.mesh.material));
let envTarget: THREE.WebGLRenderTarget | null = null;
let envUpdatedAt = -Infinity;
let envGameSeconds = -Infinity;
function refreshEnvironment(gameSeconds: number, now: number): void {
  if (now - envUpdatedAt < 3 && Math.abs(gameSeconds - envGameSeconds) < 20) return;
  envUpdatedAt = now;
  envGameSeconds = gameSeconds;
  const next = pmrem.fromScene(envScene, 0.04, 1, 6000);
  envTarget?.dispose();
  envTarget = next;
  scene.environment = next.texture;
}
scene.environmentIntensity = 0.55;

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

// Colour grading in display space: gentle S-curve contrast, slightly richer colour,
// cool shadows and warm highlights, and a soft vignette.
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uNight: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uNight;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.07);
      vec3 cool = vec3(0.96, 0.99, 1.05);
      vec3 warm = vec3(1.04, 1.0, 0.95);
      c *= mix(cool, warm, smoothstep(0.15, 0.75, l));
      c = mix(c, c * vec3(0.85, 0.92, 1.12), uNight * 0.35);
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 0.55;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(grade);

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
let water: WaterSystem | null = null;
let boat: BoatView | null = null;
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
    scene.add(buildGrass(terrain, built.mesh, built.grassWeight, lowQuality ? 18000 : 48000));
    water = new WaterSystem(terrain, msg.flow);
    scene.add(water.mesh);
    // Boat route: down the river (starting inside the map), then a loop of the lake.
    const half = terrain.size / 2 - 12;
    const river = msg.waterway.river.filter(([x, z]) => Math.abs(x) < half && Math.abs(z) < half);
    const lk = msg.waterway.lake;
    const lakeLoop: [number, number][] = [0, 1, 2, 3, 4, 5].map((k) => [lk.x + Math.cos(-2.3 + k * 1.05) * lk.r * 0.45, lk.z + Math.sin(-2.3 + k * 1.05) * lk.r * 0.45]);
    boat = buildBoat(water, [...river, ...lakeLoop]);
    scene.add(boat.group);
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
    // Villagers fetching water stir the surface.
    for (let k = 0; k < msg.villagers.length; k += VILLAGER_STRIDE) {
      if (msg.villagers[k + 3] === 3 && Math.random() < 0.15) {
        const h = msg.villagers[k + 2];
        water?.disturb(msg.villagers[k] + Math.sin(h) * 1.2, msg.villagers[k + 1] + Math.cos(h) * 1.2, -0.05, 0.6);
      }
    }
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

// Double-click (or double-tap) water to make a splash in the wave simulation.
const raycaster = new THREE.Raycaster();
function splashAt(clientX: number, clientY: number): void {
  if (!water || !terrain) return;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -terrain.waterLevel), hit)) return;
  if (water.depthAt(hit.x, hit.z) > 0.1) water.disturb(hit.x, hit.z, -0.45, 1.8);
}
renderer.domElement.addEventListener('dblclick', (e) => splashAt(e.clientX, e.clientY));
let lastTap = 0;
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch') return;
  const now = performance.now();
  if (now - lastTap < 320) splashAt(e.clientX, e.clientY);
  lastTap = now;
});

// Toolbar (also the way to reach these actions on a phone).
const toolbar = document.getElementById('toolbar')!;
toolbar.style.display = showUi ? 'flex' : 'none';
function button(label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => onClick(b));
  toolbar.appendChild(b);
  return b;
}
const speedButton = button('Speed 1×', () => {
  const next = SPEEDS[(SPEEDS.indexOf(simSpeed) + 1) % SPEEDS.length];
  send({ type: 'setSpeed', speed: next });
});
button('Skip time', () => send({ type: 'setTime', totalSeconds: simSeconds + CYCLE_SECONDS / 8 }));
button('Hex grid', () => hexOverlay && (hexOverlay.visible = !hexOverlay.visible));
const followButtons: HTMLButtonElement[] = [];
const followTarget = (b: HTMLButtonElement, target: () => THREE.Vector3 | null, distance: number) => {
  const active = b.classList.contains('on');
  followButtons.forEach((x) => x.classList.remove('on'));
  if (active) rig.setFollow(null);
  else {
    rig.setFollow(target, distance);
    b.classList.add('on');
  }
};
followButtons.push(button('Follow airship', (b) => followTarget(b, () => airship.group.position.clone(), 38)));
followButtons.push(button('Follow canoe', (b) => followTarget(b, () => (boat ? boat.group.position.clone() : null), 16)));
followButtons.push(button('Camp', (b) => followTarget(b, () => (villagers ? villagers.positionOf(0) : null), 22)));
rig.onUserMove = () => followButtons.forEach((x) => x.classList.remove('on'));
if (params.get('follow') === 'airship') followButtons[0].click();
if (params.get('follow') === 'canoe') followButtons[1].click();

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
  globalUniforms.uSunDir.value.copy(s.lightDir);
  globalUniforms.uSunColor.value.copy(s.lightColor).multiplyScalar(Math.min(1, s.lightIntensity / 3));
  rig.update(dt);
  const pivot = rig.pivot;
  sun.position.copy(pivot).addScaledVector(s.lightDir, 300);
  sun.target.position.copy(pivot);
  sun.color.copy(s.lightColor);
  sun.intensity = s.lightIntensity;
  hemi.color.copy(s.hemiSky);
  hemi.groundColor.copy(s.hemiGround);
  hemi.intensity = s.hemiIntensity * (0.55 + s.night * 0.6);
  refreshEnvironment(gameSeconds, realTime);
  scene.environmentIntensity = 0.35 + (1 - s.night) * 0.4;
  grade.uniforms.uNight.value = s.night;
  (scene.fog as THREE.FogExp2).color.copy(s.fogColor);
  renderer.toneMappingExposure = s.exposure;
  if (water) {
    water.update(dt);
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
  boat?.update(dt, realTime);

  composer.render(dt);
  if (showUi) {
    const help = touchDevice
      ? 'Drag to pan · pinch to zoom · twist to rotate · two fingers up/down to tilt · double-tap water to splash'
      : 'WASD/QE/drag/wheel camera · Shift+wheel tilt · 1–4 speed · T skip time · H hex grid · double-click water to splash';
    hud.innerHTML = `${clockText(gameSeconds)}<br><span class="quiet">${help}</span>`;
    speedButton.textContent = simSpeed === 0 ? 'Paused' : `Speed ${simSpeed}×`;
  }

  if (framesSinceWorld >= 0 && ++framesSinceWorld === 8) (window as unknown as { __mystReady: boolean }).__mystReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
