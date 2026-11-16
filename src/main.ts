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
//   inspect=x,z      open the hex inspector for the hex at this world position
//   style=N          force one of the town styles (0-5)
//   discover=all     grant every discovery and build every invention (or a comma list of ids)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Heightfield } from './sim/terrain';
import { calendar, CYCLE_SECONDS, DAY_SECONDS } from './sim/time';
import { VILLAGER_STRIDE, type FromSim, type HexInfo, type Stats, type StructureView, type ToSim } from './sim/protocol';
import { hexCorners, worldToHex, type Hex } from './sim/hex';
import { buildTerrain } from './render/terrainMesh';
import { WaterSystem } from './render/water';
import { buildBoat, canoeGeometry, type BoatMode, type BoatView } from './render/boat';
import { natureMaterial } from './render/materials';
import { buildSky, skyState } from './render/sky';
import { LINES } from './sim/data/structures';
import { buildRoads, type RoadsView } from './render/roads';
import { buildVegetation, type Vegetation } from './render/vegetation';
import { buildGrass } from './render/grass';
import { buildCamp, type CampBuild } from './render/camp';
import { buildVillagers, type VillagerView } from './render/villagers';
import { buildAnimals, type AnimalsView } from './render/animals';
import { townStyle } from './render/buildings';
import { buildTown, type TownView } from './render/town';
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
// Buildings under construction rise behind a clipping plane.
renderer.localClippingEnabled = true;
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
/** One boat per villager out on the water, keyed by villager index. */
const boats = new Map<number, BoatView>();
const mooredGroup = new THREE.Group();
let canoesOwned = 0;
let landingSpot: { x: number; z: number; rot: number } | null = null;
const canoeMat = natureMaterial({ roughness: 0.85 });
let canoeGeo: THREE.BufferGeometry | null = null;

function updateMoored(): void {
  mooredGroup.clear();
  if (!landingSpot || !water) return;
  const idle = Math.max(0, Math.min(4, canoesOwned - boats.size));
  for (let k = 0; k < idle; k++) {
    canoeGeo ??= canoeGeometry();
    const m = new THREE.Mesh(canoeGeo, canoeMat);
    // Side by side along the jetty, bows pointing out over the water.
    const side = (k - (idle - 1) / 2) * 1.2;
    const out = 3.5;
    const x = landingSpot.x + Math.sin(landingSpot.rot) * out + Math.cos(landingSpot.rot) * side;
    const z = landingSpot.z + Math.cos(landingSpot.rot) * out - Math.sin(landingSpot.rot) * side;
    m.position.set(x, terrain ? Math.max(terrain.waterLevel + 0.12, terrain.sample(x, z) + 0.1) : 0, z);
    m.rotation.y = landingSpot.rot - Math.PI / 2;
    m.castShadow = true;
    mooredGroup.add(m);
  }
}
let camp: CampBuild | null = null;
let villagers: VillagerView | null = null;
let animals: AnimalsView | null = null;
let town: TownView | null = null;
let vegetation: Vegetation | null = null;
let roads: RoadsView | null = null;
let gallery: StructureView[] | null = null;
let hexOverlay: THREE.LineSegments | null = null;
// Inventions only appear once the band has built them.
const airship = buildAirship();
airship.group.visible = false;
scene.add(airship.group);

let simSeconds = startSeconds;
let simSpeed = startSpeed;
let lastTickAt = performance.now();
let framesSinceWorld = -1;
let terrainMesh: THREE.Mesh | null = null;
let latestStats: Stats | null = null;

worker.onmessage = (e: MessageEvent<FromSim>) => {
  const msg = e.data;
  if (msg.type === 'world') {
    const t = msg.terrain;
    terrain = new Heightfield(t.res, t.size, t.heights, t.waterLevel);
    globalUniforms.uWorldSize.value = t.size;
    const built = buildTerrain(terrain, msg.camp, msg.props, msg.biome);
    terrainMesh = built.mesh;
    scene.add(built.mesh);
    scene.add(buildGrass(terrain, built.mesh, built.grassWeight, lowQuality ? 30000 : 90000));
    water = new WaterSystem(terrain, msg.flow);
    scene.add(water.mesh);
    // Canoes are drawn where fishers take them; idle ones lie moored at the landing.
    mooredGroup.clear();
    scene.add(mooredGroup);
    animals = buildAnimals(msg.herds, terrain, water);
    scene.add(animals.group);
    town = buildTown(terrain, townStyle(seed, params.has('style') ? Number(params.get('style')) : undefined));
    scene.add(town.group);
    roads = buildRoads(terrain);
    scene.add(roads.group);
    vegetation = buildVegetation(msg.props, terrain);
    scene.add(vegetation);
    if (params.has('gallery')) {
      // Preview: every building of an age laid out in rows on cleared ground.
      const era = params.get('gallery')!;
      const at = (params.get('galleryAt') ?? '').split(',').map(Number);
      const cx = Number.isFinite(at[0]) && at.length === 2 ? at[0] : msg.camp.center.x;
      const cz = Number.isFinite(at[1]) && at.length === 2 ? at[1] : msg.camp.center.z;
      const tiers = LINES.flatMap((l) => l.tiers.filter((t) => t.era === era).map((t) => ({ line: l.id, model: t.model })));
      const cols = Math.ceil(Math.sqrt(tiers.length));
      const sp = Number(params.get('gallerySpacing') ?? 15);
      gallery = tiers.map((t, i) => ({
        id: i + 1, line: t.line, model: t.model, built: 1, previous: null, variant: Number(params.get('variant') ?? i % 4), animals: 3,
        x: cx + ((i % cols) - (cols - 1) / 2) * sp, z: cz + (Math.floor(i / cols) - (cols - 1) / 2) * sp, rot: 0,
      }));
      const r = (cols / 2 + 1) * sp;
      vegetation.hide(msg.props.flatMap((p, i) => (Math.abs(p.x - cx) < r && Math.abs(p.z - cz) < r ? [i] : [])));
      town.setStructures(gallery);
    }
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
    const ins = (params.get('inspect') ?? '').split(',').map(Number);
    if (ins.length === 2 && ins.every(Number.isFinite)) {
      const h = worldToHex(ins[0], ins[1]);
      send({ type: 'inspectHex', q: h.q, r: h.r });
    }
  } else if (msg.type === 'tick') {
    simSeconds = msg.totalSeconds;
    simSpeed = msg.speed;
    lastTickAt = performance.now();
    villagers?.setTargets(msg.villagers);
    animals?.setTargets(msg.herds);
    // Fishers out in canoes: each gets a boat that follows them.
    const out = new Set<number>();
    for (let k = 0, i = 0; k < msg.villagers.length; k += VILLAGER_STRIDE, i++) {
      const act = msg.villagers[k + 3];
      if (act < 6 || act > 8 || !water) continue;
      out.add(i);
      let b = boats.get(i);
      if (!b) {
        b = buildBoat(water, i % 6, i, [msg.villagers[k], msg.villagers[k + 1]]);
        boats.set(i, b);
        scene.add(b.group);
      }
      const mode: BoatMode = act === 6 ? 'paddle' : act === 7 ? 'fish' : 'trawl';
      b.setTarget(msg.villagers[k], msg.villagers[k + 1], mode);
    }
    let changed = false;
    for (const [i, b] of boats)
      if (!out.has(i)) {
        scene.remove(b.group);
        boats.delete(i);
        changed = true;
      }
    if (changed || out.size !== mooredGroup.children.length) updateMoored();
    // The airship follows its voyage.
    airship.group.visible = msg.voyages.length > 0;
    if (msg.voyages.length) airship.setTarget(msg.voyages[0], msg.voyages[1], msg.voyages[2], msg.voyages[3], msg.voyages[4]);
    // Villagers fetching water stir the surface.
    for (let k = 0; k < msg.villagers.length; k += VILLAGER_STRIDE) {
      if (msg.villagers[k + 3] === 3 && Math.random() < 0.15) {
        const h = msg.villagers[k + 2];
        water?.disturb(msg.villagers[k] + Math.sin(h) * 1.2, msg.villagers[k + 1] + Math.cos(h) * 1.2, -0.05, 0.6);
      }
    }
  } else if (msg.type === 'wear') {
    // Footpaths: wear from the simulation drawn on the terrain and flattening the grass.
    // R: wear (roads count as fully worn, so grass stays flat on them); G: road tier.
    const bytes = new Uint8Array(msg.n * msg.n * 2);
    for (let k = 0; k < msg.n * msg.n; k++) {
      const road = msg.roads[k];
      bytes[k * 2] = road ? 255 : Math.min(255, Math.round(Math.min(1, msg.data[k]) * 255));
      bytes[k * 2 + 1] = Math.round((road / 7) * 255);
    }
    const tex = new THREE.DataTexture(bytes, msg.n, msg.n, THREE.RGFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    globalUniforms.uWear.value.dispose();
    globalUniforms.uWear.value = tex;
  } else if (msg.type === 'stats') {
    const prev = latestStats;
    latestStats = msg.stats;
    const canoes = msg.stats.vehicles.filter((v) => v.id === 'dugout-canoe' || v.id === 'plank-boat').reduce((n, v) => n + v.count, 0);
    const hasCanoe = canoes > 0;
    if (canoes !== canoesOwned) {
      canoesOwned = canoes;
      updateMoored();
    }
    const hasAirship = msg.stats.vehicles.some((v) => v.id === 'airship' || v.id === 'motor-airship');

    followButtons[0].style.display = hasAirship ? '' : 'none';
    followButtons[1].style.display = hasCanoe ? '' : 'none';
    // Announce new events from the chronicle.
    const latest = msg.stats.events[0];
    if (latest && prev && prev.events[0]?.text !== latest.text) toast(latest.text);
    if (panel.style.display !== 'none') renderPanel();
  } else if (msg.type === 'structures') {
    town?.setStructures(gallery ?? msg.list);
    vegetation?.hide(msg.cleared);
    const l = msg.list.find((s) => s.model === 'landing' || s.previous === 'landing') ?? msg.list.find((s) => s.line === 'port');
    landingSpot = l && l.built >= 1 ? { x: l.x, z: l.z, rot: l.rot } : null;
    updateMoored();
  } else if (msg.type === 'streets') {
    roads?.set(msg.streets);
  } else if (msg.type === 'roster') {
    villagers?.setRoster(msg.villagers);
  } else if (msg.type === 'hexInfo') {
    showHexInfo(msg.info);
  } else if (msg.type === 'saved') {
    const blob = new Blob([msg.json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mystpath-save-${Date.now()}.json`;
    a.click();
  }
};
// With a warm-up, discoveries are granted before it so the warm-up plays out with them.
const grant = params.has('discover') ? (params.get('discover') === 'all' ? ('all' as const) : params.get('discover')!.split(',')) : undefined;
send({ type: 'init', seed, startSeconds, speed: startSpeed, warmup: num('warm', 0), grant: num('warm', 0) > 0 ? grant : undefined });
if (params.has('discover') && !(num('warm', 0) > 0)) send({ type: 'grantDiscoveries', ids: params.get('discover') === 'all' ? 'all' : params.get('discover')!.split(',') });

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
let downAt = { x: 0, y: 0, t: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY, t: performance.now() }));
renderer.domElement.addEventListener('pointerup', (e) => {
  const now = performance.now();
  const tap = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && now - downAt.t < 400;
  if (e.pointerType === 'touch' && now - lastTap < 320) {
    splashAt(e.clientX, e.clientY);
    lastTap = 0;
    return;
  }
  if (e.pointerType === 'touch') lastTap = now;
  if (tap && e.button === 0) selectHexAt(e.clientX, e.clientY);
});

// Tap a hex to see its environment and what lies on and under it.
let selection: THREE.LineLoop | null = null;
function selectHexAt(clientX: number, clientY: number): void {
  if (!terrainMesh || !terrain) return;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(terrainMesh, false)[0];
  if (!hit) return;
  const h: Hex = worldToHex(hit.point.x, hit.point.z);
  send({ type: 'inspectHex', q: h.q, r: h.r });
  if (selection) scene.remove(selection);
  const pts = hexCorners(h).map((c) => new THREE.Vector3(c.x, Math.max(terrain!.waterLevel, terrain!.sample(c.x, c.z)) + 0.3, c.z));
  selection = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffd36b', depthTest: false }));
  selection.renderOrder = 10;
  scene.add(selection);
}
const hexCard = document.getElementById('hexcard')!;
function showHexInfo(info: HexInfo | null): void {
  if (!info) {
    hexCard.style.display = 'none';
    return;
  }
  const list = (items: { name: string; qty: number; max?: number }[]) =>
    items.length ? items.map((i) => `<li><span>${i.name}</span><b>${i.qty}${i.max !== undefined ? ` / ${Math.round(i.max)}` : ''}</b></li>`).join('') : '<li class="quiet">None</li>';
  const living = (items: { name: string; count: number; holds: string }[]) =>
    items.length ? items.map((i) => `<li><span>${i.name} <span class="quiet">×${i.count}</span>${i.holds ? `<br><span class="quiet small">${i.holds}</span>` : ''}</span></li>`).join('') : '<li class="quiet">None</li>';
  hexCard.innerHTML = `<button class="close" aria-label="Close">×</button><h3>${info.environment}</h3>
    ${info.water ? `<div class="quiet">${info.water}: unlimited</div>` : ''}
    <h4>Plants</h4><ul>${living(info.plants)}</ul>
    <h4>Animals</h4><ul>${living(info.animals)}</ul>
    <h4>On the ground</h4><ul>${list(info.ground)}</ul>
    <h4>Below ground</h4><ul>${list(info.below)}</ul>
    ${info.buildings.length ? `<h4>Buildings</h4><ul>${info.buildings.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}`;
  hexCard.style.display = 'block';
  hexCard.querySelector('.close')!.addEventListener('click', () => {
    hexCard.style.display = 'none';
    if (selection) scene.remove(selection);
  });
}

// Stats panel: the stockpile and every villager — the stats-first view of the civilization.
const panel = document.getElementById('panel')!;
panel.style.display = params.get('stats') === '1' ? 'block' : 'none';
function renderPanel(): void {
  const st = latestStats;
  if (!st) return;
  const groups = new Map<string, { name: string; qty: number }[]>();
  for (const item of st.stockpile) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group)!.push(item);
  }
  const stock = [...groups.entries()]
    .map(([g, items]) => `<h4>${g}</h4><ul>${items.map((i) => `<li><span>${i.name}</span><b>${i.qty}</b></li>`).join('')}</ul>`)
    .join('');
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const people = st.villagers
    .map(
      (v) => `<div class="person"><div class="row"><b>${v.name}${v.prodigy ? ' <span class="tag">prodigy</span>' : ''}${v.inspired ? ' <span class="tag gold">inspired</span>' : ''}</b><span class="quiet">loves ${v.passion} · gifted at ${v.talent}</span></div>
      <div class="row"><span>${v.job ?? (v.activity === 'sleeping' ? 'Sleeping' : 'Resting')}</span><span class="quiet">fed ${pct(1 - v.hunger)} · fulfilled ${pct(v.fulfilment)}</span></div>
      ${v.carrying ? `<div class="quiet">Carrying ${v.carrying}</div>` : ''}
      <div class="quiet">Priorities: ${v.priorities.slice(0, 3).join(', ') || '—'}</div>
      ${v.skills.length ? `<div class="quiet">Skills: ${v.skills.map((s) => `${s.job} ${s.level}`).join(', ')}</div>` : ''}
      ${v.idea ? `<div class="quiet">Working something out: ${v.idea.name} <span class="bar"><i style="width:${pct(v.idea.progress)}"></i></span></div>` : ''}
      ${v.discoveries.length ? `<div class="quiet">Discovered: ${v.discoveries.join(', ')}</div>` : ''}
      <button class="inspire" data-id="${v.id}" ${v.inspired ? 'disabled' : ''}>Inspire</button></div>`,
    )
    .join('');
  const disc = st.discoveries.length ? st.discoveries.map((d) => `<li><span>${d.name}</span><span class="quiet">${d.by ?? ''}</span></li>`).join('') : '<li class="quiet">None yet. Villagers make discoveries through their work.</li>';
  const events = st.events.length ? st.events.map((e) => `<li><span class="quiet">Day ${e.day}</span> ${e.text}</li>`).join('') : '<li class="quiet">Nothing yet.</li>';
  const buildings = st.buildings.length
    ? st.buildings.map((b) => `<li><span>${b.name}${b.owner ? ` <span class="quiet">· ${b.owner}</span>` : ''}</span><span class="quiet">${b.state}${b.workers ? ` · ${b.workers} at work` : ''}</span></li>`).join('')
    : '<li class="quiet">Nothing built yet. The band lives in its camp until it learns how to build.</li>';
  const label = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
  const goods = st.goods
    .filter((g) => g.name || ['clothing', 'tools', 'wares', 'medicine'].includes(g.category))
    .map((g) => `<li><span>${label(g.category)}: ${g.name ?? '<span class="quiet">none</span>'}</span><span class="quiet">${g.name ? `${Math.round(g.coverage * 100)}% covered · ${g.quality >= g.expected ? 'good for the age' : 'behind the age'}` : 'going without'}</span></li>`)
    .join('');
  const vehicles = st.vehicles.map((v) => `${v.name}${v.count > 1 ? ` ×${v.count}` : ''}`).join(', ');
  panel.innerHTML = `<button class="close" aria-label="Close">×</button><h3>Civilization</h3>
    <div class="row"><b>${st.era} era</b>${st.nextEra ? `<span class="quiet">${st.nextEra.name}: ${st.nextEra.have} of ${st.nextEra.need} discoveries</span>` : ''}</div>
    <div class="quiet">Food on hand: ${st.food.toFixed(1)} days for one person · spoiled yesterday: ${st.spoiledYesterday.toFixed(1)}</div>
    <div class="quiet">Food storage: ${st.storage.length ? st.storage.join(', ') : 'none yet (open air)'}</div>
    <h4>Goods in use</h4><ul>${goods}</ul>
    <h4>Discoveries</h4><ul>${disc}</ul>
    <div class="quiet">People: ${st.population} · beds: ${st.housing} · roads: ${st.roads}${st.streets ? ` (${st.streets} streets)` : ''}${vehicles ? ` · boats and craft: ${vehicles}` : ''}</div>
    <div class="quiet">At home: ${st.homeNoise < 0.08 ? 'quiet' : st.homeNoise < 0.25 ? 'some noise' : 'noisy'} (${Math.round(st.homeNoise * 100)}%) · walk to work: ${Math.round(st.walkToWork)} m</div>
    <h4>Buildings</h4><ul>${buildings}</ul>
    <h4>Chronicle</h4><ul class="chronicle">${events}</ul>
    <h3>People</h3>${people}<h3>Stockpile</h3>${stock}`;
  panel.querySelectorAll<HTMLButtonElement>('.inspire').forEach((b) =>
    b.addEventListener('click', () => {
      send({ type: 'inspire', villager: Number(b.dataset.id) });
      b.disabled = true;
    }),
  );
  panel.querySelector('.close')!.addEventListener('click', () => (panel.style.display = 'none'));
}

// Short notices for notable events (discoveries, inventions, hunted-out herds).
const toastEl = document.createElement('div');
toastEl.id = 'toast';
document.body.appendChild(toastEl);
let toastTimer = 0;
function toast(text: string): void {
  if (!showUi) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 6000);
}

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
button('Stats', () => {
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  renderPanel();
});
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
followButtons.push(button('Follow canoe', (b) => followTarget(b, () => (boats.size ? [...boats.values()][0].group.position.clone() : null), 16)));
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
  animals?.update(dt, realTime);
  airship.update(gameSeconds, s.night, dt);
  for (const b of boats.values()) b.update(dt, realTime);

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
