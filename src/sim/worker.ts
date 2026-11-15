// The simulation runs here, off the main thread, so heavy simulation never stalls rendering.

import { ENVIRONMENT_BY_ID } from './data/environments';
import { JOB_NAMES, type JobId } from './data/jobs';
import { MATERIAL_BY_ID } from './data/materials';
import { itemName, PRODUCTS } from './data/processing';
import { ACTIVITY_CODES, VILLAGER_STRIDE, type FromSim, type Stats, type ToSim } from './protocol';
import { saveWorld } from './save';
import { LAKE, RIVER } from './testScene';
import { carryCategory, foodTotal, level } from './villagerAI';
import { createWorld, tick, type World } from './world';

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
    name: v.name,
    passion: v.passion,
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
  return { stockpile, villagers, food: foodTotal(w) };
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
    case 'inspectHex': {
      if (!world) break;
      const h = world.hexes.find((x) => x.q === msg.q && x.r === msg.r);
      if (!h) {
        post({ type: 'hexInfo', info: null });
        break;
      }
      post({
        type: 'hexInfo',
        info: {
          q: h.q,
          r: h.r,
          environment: ENVIRONMENT_BY_ID.get(h.env)?.name ?? h.env,
          surface: Object.keys(h.surfaceMax)
            .map((id) => ({ name: itemName(id, MATERIAL_BY_ID), qty: Math.floor(h.surface[id] ?? 0), max: h.surfaceMax[id] }))
            .sort((a, b) => b.max - a.max),
          subsurface: Object.entries(h.subsurface)
            .map(([id, qty]) => ({ name: itemName(id, MATERIAL_BY_ID), qty }))
            .sort((a, b) => b.qty - a.qty),
        },
      });
      break;
    }
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
  post({ type: 'tick', totalSeconds: w.clock.totalSeconds, speed: w.clock.speed, villagers: buf }, [buf.buffer]);
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
