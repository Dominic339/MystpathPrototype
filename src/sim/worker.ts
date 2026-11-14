// The simulation runs here, off the main thread, so heavy simulation never stalls rendering.

import { ACTIVITY_CODES, VILLAGER_STRIDE, type FromSim, type ToSim } from './protocol';
import { saveWorld } from './save';
import { createWorld, tick, type World } from './world';

const TICK_HZ = 10;
const MAX_STEP = 0.5; // game seconds per sub-step, keeps fast-forward stable

let world: World | null = null;
let last = performance.now();

function post(msg: FromSim, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
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
        villagers: world.villagers.map((v) => ({ id: v.id, name: v.name, passion: v.passion, look: v.look })),
      });
      last = performance.now();
      break;
    }
    case 'setSpeed':
      if (world) world.clock.speed = msg.speed;
      break;
    case 'setTime':
      if (world) world.clock.totalSeconds = msg.totalSeconds;
      break;
    case 'save':
      if (world) post({ type: 'saved', json: JSON.stringify(saveWorld(world)) });
      break;
  }
};

setInterval(() => {
  if (!world) return;
  const now = performance.now();
  let dt = ((now - last) / 1000) * world.clock.speed;
  last = now;
  while (dt > 0) {
    const step = Math.min(MAX_STEP, dt);
    tick(world, step);
    dt -= step;
  }
  const vs = world.villagers;
  const buf = new Float32Array(vs.length * VILLAGER_STRIDE);
  vs.forEach((v, k) => {
    buf[k * VILLAGER_STRIDE] = v.x;
    buf[k * VILLAGER_STRIDE + 1] = v.z;
    buf[k * VILLAGER_STRIDE + 2] = v.heading;
    buf[k * VILLAGER_STRIDE + 3] = ACTIVITY_CODES.indexOf(v.activity);
  });
  post({ type: 'tick', totalSeconds: world.clock.totalSeconds, speed: world.clock.speed, villagers: buf }, [buf.buffer]);
}, 1000 / TICK_HZ);
