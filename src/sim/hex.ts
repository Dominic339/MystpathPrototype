// Hex grid used for game logic: ownership, environments, resources, buildings.
// Flat-top axial coordinates. One hex is roughly the footprint of one large building.

/** Hex circumradius in world units (metres). */
export const HEX_SIZE = 10;

export interface Hex {
  q: number;
  r: number;
}

const SQRT3 = Math.sqrt(3);

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

/** Centre of a hex on the XZ plane. */
export function hexToWorld(h: Hex, size = HEX_SIZE): { x: number; z: number } {
  return { x: size * 1.5 * h.q, z: size * SQRT3 * (h.r + h.q / 2) };
}

/** The hex containing a world XZ point. */
export function worldToHex(x: number, z: number, size = HEX_SIZE): Hex {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * z) / size;
  return hexRound(q, r);
}

export function hexRound(qf: number, rf: number): Hex {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** All hexes within `radius` steps of `center`. */
export function hexesInRadius(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q: center.q + q, r: center.r + r });
  }
  return out;
}

/** The six corners of a flat-top hex, in world XZ. */
export function hexCorners(h: Hex, size = HEX_SIZE): { x: number; z: number }[] {
  const c = hexToWorld(h, size);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    out.push({ x: c.x + size * Math.cos(a), z: c.z + size * Math.sin(a) });
  }
  return out;
}
