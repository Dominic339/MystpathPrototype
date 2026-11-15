# Mystpath

A god game: you watch over a living civilization and guide it through acts of god.
Followers pray for faith, discoveries come from individual villagers, and your behavior
and reputation shape what kind of god you become.

The full design lives in the **Mystpath Game Design Document** (Claude Docs).

## Status

Restarted from scratch on a web stack (the old Unity prototype was removed).

- **Milestone 1 — Foundation:** done. TypeScript + Three.js, simulation in a Web Worker
  separate from rendering, deterministic seeds, save/load, tests, headless screenshots.
- **Milestone 2 — Visual test scene:** done, awaiting art review. A hand-shaped valley
  with a river, lake, rocky outcrop, forest, a hunter-gatherer camp and an airship,
  with a full day-night cycle. Water is simulated: a wave simulation carries ripples,
  splashes and wakes, the river current flows toward the lake, and a canoe floats, drifts
  and leaves a wake.
- Next: milestone 3, procedural world generation.

## Running it

```bash
npm install
npm run dev        # open the printed URL
npm test           # simulation tests
npm run build      # type-check and production build
npm run screenshot # renders ./screenshots (after a build; needs Chrome)
```

### Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys, or drag | Pan |
| Q / E | Rotate |
| Mouse wheel | Zoom |
| Shift + wheel | Tilt |
| 1 / 2 / 3 / 4 | Pause / 1× / 10× / 60× speed |
| Space | Pause / resume |
| T | Skip ahead 1/8 of a day |
| H | Toggle the hex grid |
| P | Download a save file |
| Double-click water | Splash into the wave simulation |
| Toolbar | Speed, skip time, hex grid, follow the airship / canoe / camp |

Touch (testing only — the game targets PC): drag pans, pinch zooms, twist rotates,
two fingers up/down tilt, double-tap water to splash. Phones get a lighter graphics mode.

URL parameters for testing: `seed`, `t` (game seconds; 0 sunrise, 300 noon, 600 sunset,
900 midnight), `speed`, `warm`, `cam=x,z,yaw,pitch,distance`, `hex=1`, `q=low`, `ui=0`.

## Layout

```
src/
  sim/      simulation only — no rendering code, so it can later run on a server
    rng.ts, noise.ts   deterministic randomness and noise
    hex.ts             flat-top axial hex grid (1 hex ≈ one large building, 10 m radius)
    terrain.ts         editable heightfield (flatten / raise for terraforming)
    time.ts            game clock: 10 min day + 10 min night, 10-day seasons, 4 seasons
    world.ts           world state and tick
    testScene.ts       milestone 2 hand-shaped valley
    save.ts            JSON save / load
    worker.ts          runs the simulation off the main thread
  render/   Three.js drawing of the simulation state; every model is built in code
  main.ts   renderer, post-processing, input, HUD
tests/      Vitest tests for the simulation
scripts/    headless screenshot tool
```
