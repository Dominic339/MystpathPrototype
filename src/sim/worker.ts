// The simulation runs here, off the main thread, so heavy simulation never stalls rendering.

import { speciesIndex } from './animals';
import { DISCOVERY_BY_ID } from './data/discoveries';
import { ENVIRONMENT_BY_ID } from './data/environments';
import { ERA_NAMES, ERAS, eraIndex } from './data/eras';
import { FAUNA_BY_ID } from './data/fauna';
import { FLORA_BY_ID } from './data/flora';
import { closestDiscovery, currentEra, ERA_THRESHOLD, inspire, makeDiscovery } from './discovery';
import { hexKey, worldToHex } from './hex';
import { JOB_NAMES, type JobId } from './data/jobs';
import { MATERIAL_BY_ID } from './data/materials';
import { itemName, PRODUCTS } from './data/processing';
import { ACTIVITY_CODES, HERD_STRIDE, VILLAGER_STRIDE, type FromSim, type Stats, type ToSim } from './protocol';
import { saveWorld } from './save';
import { LAKE, RIVER } from './testScene';
import { carryCategory, foodTotal, level } from './villagerAI';
import { activeStorage } from './food';
import { calendar } from './time';
import { createWorld, grantAll, tick, type World } from './world';

const TICK_HZ = 10;
const MAX_STEP = 0.5; // game seconds per sub-step, keeps fast-forward stable

let world: World | null = null;
let last = performance.now();
let lastStats = 0;
let lastWear = 0;

function post(msg: FromSim, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

const GROUP_NAMES: Record<string, string> = {
  'stone-earth': 'Stone and earth',
  ore: 'Ores',
  'fuel-mineral': 'Fuels and minerals',
  gem: 'Gems',
  water: 'Water',
  plant: 'Plants',
  animal: 'Animal',
  magic: 'Magical',
};

function stats(w: World): Stats {
  const stockpile = Object.entries(w.stockpile)
    .filter(([, q]) => q >= 1)
    .map(([id, qty]) => {
      const m = MATERIAL_BY_ID.get(id);
      return { id, name: itemName(id, MATERIAL_BY_ID), qty: Math.floor(qty), group: m ? GROUP_NAMES[m.category] : PRODUCTS[id] ? 'Made goods' : 'Other' };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || b.qty - a.qty);
  const villagers = w.villagers.map((v) => ({
    id: v.id,
    name: v.name,
    passion: v.passion,
    talent: v.talent,
    prodigy: v.prodigy,
    inspired: w.clock.totalSeconds < v.inspiredUntil,
    idea: closestDiscovery(w, v),
    discoveries: v.discoveries.map((id) => DISCOVERY_BY_ID.get(id)?.name ?? id),
    job: v.job ? JOB_NAMES[v.job] : null,
    activity: v.activity,
    hunger: v.hunger,
    fulfilment: v.fulfilment,
    priorities: v.priorities.map((p) => JOB_NAMES[p.job]),
    skills: (Object.entries(v.skills) as [JobId, number][])
      .map(([job, xp]) => ({ job: JOB_NAMES[job], level: level(xp) }))
      .filter((s) => s.level > 0)
      .sort((a, b) => b.level - a.level)
      .slice(0, 3),
    carrying: Object.entries(v.carrying)
      .map(([id, q]) => `${q} ${itemName(id, MATERIAL_BY_ID).toLowerCase()}`)
      .join(', '),
  }));
  const era = currentEra(w);
  const next = ERAS[eraIndex(era) + 1];
  return {
    stockpile,
    villagers,
    food: foodTotal(w),
    era: ERA_NAMES[era],
    discoveries: w.discoveryLog.map((e) => {
      const d = DISCOVERY_BY_ID.get(e.id);
      return { name: d?.name ?? e.id, era: d ? ERA_NAMES[d.era] : '', by: e.by };
    }),
    nextEra: next ? { name: ERA_NAMES[next], have: w.discoveries.filter((id) => DISCOVERY_BY_ID.get(id)?.era === next).length, need: ERA_THRESHOLD } : null,
    events: w.events.slice(-12).reverse().map((e) => ({ day: calendar(e.t).dayIndex + 1, text: e.text })),
    built: w.built.map((id) => DISCOVERY_BY_ID.get(id)?.name ?? id),
    storage: activeStorage(w).map((s) => s.name),
    spoiledYesterday: w.spoilage.yesterday,
    projects: Object.entries(w.projects).map(([id, done]) => {
      const d = DISCOVERY_BY_ID.get(id)!;
      return { name: d.name, progress: Math.min(1, done / d.build!.seconds) };
    }),
  };
}

const summary = (m: Record<string, number>) =>
  Object.entries(m)
    .filter(([, q]) => q >= 1)
    .map(([id, q]) => `${Math.floor(q)} ${itemName(id, MATERIAL_BY_ID).toLowerCase()}`)
    .join(', ');

function hexInfo(w: World, q: number, r: number): FromSim & { type: 'hexInfo' } {
  const h = w.hexes.find((x) => x.q === q && x.r === r);
  if (!h) return { type: 'hexInfo', info: null };
  const key = hexKey(h);
  const inHex = (x: number, z: number) => hexKey(worldToHex(x, z)) === key;
  const plants = new Map<string, { count: number; holds: Record<string, number> }>();
  const animals = new Map<string, { count: number; holds: Record<string, number> }>();
  for (const n of w.nodes) {
    if (!n.species || !inHex(n.x, n.z)) continue;
    const name = n.kind === 'plant' ? FLORA_BY_ID.get(n.species)!.name : FAUNA_BY_ID.get(n.species)!.name;
    const map = n.kind === 'plant' ? plants : animals;
    const e = map.get(name) ?? { count: 0, holds: {} };
    e.count++;
    for (const [id, qty] of Object.entries(n.stock)) e.holds[id] = (e.holds[id] ?? 0) + qty;
    map.set(name, e);
  }
  for (const herd of w.herds) {
    if (herd.count < 0.5 || !inHex(herd.x, herd.z)) continue;
    const sp = FAUNA_BY_ID.get(herd.species)!;
    const fish = herd.species.endsWith('fish');
    const e = animals.get(sp.name) ?? { count: 0, holds: {} };
    e.count += fish ? Math.round(herd.count * 10) : Math.round(herd.count);
    animals.set(sp.name, e);
  }
  const list = (m: typeof plants) => [...m.entries()].map(([name, e]) => ({ name, count: e.count, holds: summary(e.holds) })).sort((a, b) => b.count - a.count);
  const env = ENVIRONMENT_BY_ID.get(h.env);
  return {
    type: 'hexInfo',
    info: {
      q: h.q,
      r: h.r,
      environment: env?.name ?? h.env,
      water: env?.water ? itemName(env.water, MATERIAL_BY_ID) : null,
      ground: Object.keys(h.groundMax)
        .map((id) => ({ name: itemName(id, MATERIAL_BY_ID), qty: Math.floor(h.ground[id] ?? 0), max: h.groundMax[id] }))
        .sort((a, b) => b.max - a.max),
      plants: list(plants),
      animals: list(animals),
      below: Object.entries(h.below)
        .map(([id, qty]) => ({ name: itemName(id, MATERIAL_BY_ID), qty }))
        .sort((a, b) => b.qty - a.qty),
    },
  };
}

self.onmessage = (e: MessageEvent<ToSim>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      world = createWorld(msg.seed);
      // Optional warm-up so villagers have spread out before the first frame.
      for (let s = 0; s < (msg.warmup ?? 0); s += MAX_STEP) tick(world, MAX_STEP);
      if (msg.startSeconds !== undefined) world.clock.totalSeconds = msg.startSeconds;
      if (msg.speed !== undefined) world.clock.speed = msg.speed;
      const t = world.terrain;
      post({
        type: 'world',
        terrain: { res: t.res, size: t.size, waterLevel: t.waterLevel, heights: t.heights.slice() },
        props: world.props,
        camp: world.camp,
        flow: { res: world.flow.res, size: world.flow.size, data: world.flow.data.slice() },
        waterway: { river: RIVER.map(([x, z]) => [x, z] as [number, number]), lake: LAKE },
        villagers: world.villagers.map((v) => ({ id: v.id, name: v.name, passion: v.passion, look: v.look })),
        herds: world.herds.map((h) => ({ species: h.species, max: h.max })),
        navSize: world.nav.n,
      });
      last = performance.now();
      lastStats = 0;
      lastWear = 0;
      break;
    }
    case 'setSpeed':
      if (world) world.clock.speed = msg.speed;
      break;
    case 'setTime':
      if (world) world.clock.totalSeconds = msg.totalSeconds;
      break;
    case 'inspectHex':
      if (world) post(hexInfo(world, msg.q, msg.r));
      break;
    case 'inspire': {
      const v = world?.villagers.find((x) => x.id === msg.villager);
      if (world && v) inspire(world, v);
      break;
    }
    case 'grantDiscoveries':
      if (!world) break;
      if (msg.ids === 'all') grantAll(world);
      else for (const id of msg.ids) {
        const d = DISCOVERY_BY_ID.get(id);
        if (d) makeDiscovery(world, d, null);
      }
      break;
    case 'save':
      if (world) post({ type: 'saved', json: JSON.stringify(saveWorld(world)) });
      break;
  }
};

setInterval(() => {
  if (!world) return;
  const w = world;
  const now = performance.now();
  let dt = ((now - last) / 1000) * w.clock.speed;
  last = now;
  while (dt > 0) {
    const step = Math.min(MAX_STEP, dt);
    tick(w, step);
    dt -= step;
  }
  const vs = w.villagers;
  const buf = new Float32Array(vs.length * VILLAGER_STRIDE);
  vs.forEach((v, k) => {
    const o = k * VILLAGER_STRIDE;
    buf[o] = v.x;
    buf[o + 1] = v.z;
    buf[o + 2] = v.heading;
    buf[o + 3] = ACTIVITY_CODES.indexOf(v.activity);
    // Velocity in metres per real second, so the renderer can move villagers smoothly.
    buf[o + 4] = v.vx * w.clock.speed;
    buf[o + 5] = v.vz * w.clock.speed;
    buf[o + 6] = carryCategory(v);
  });
  const hb = new Float32Array(w.herds.length * HERD_STRIDE);
  w.herds.forEach((h, k) => {
    const o = k * HERD_STRIDE;
    hb[o] = h.x;
    hb[o + 1] = h.z;
    hb[o + 2] = h.heading;
    hb[o + 3] = h.count;
    hb[o + 4] = h.state;
    hb[o + 5] = h.vx * w.clock.speed;
    hb[o + 6] = h.vz * w.clock.speed;
    hb[o + 7] = speciesIndex(h.species);
  });
  post({ type: 'tick', totalSeconds: w.clock.totalSeconds, speed: w.clock.speed, villagers: buf, herds: hb }, [buf.buffer, hb.buffer]);
  if (now - lastStats > 1000) {
    lastStats = now;
    post({ type: 'stats', stats: stats(w) });
  }
  if (now - lastWear > 3000) {
    lastWear = now;
    const data = w.nav.wear.slice();
    post({ type: 'wear', n: w.nav.n, data }, [data.buffer]);
  }
}, 1000 / TICK_HZ);
