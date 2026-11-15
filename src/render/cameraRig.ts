// Management camera: orbits a pivot on the ground (or follows a moving target).
// Desktop: WASD / arrows pan · Q/E rotate · wheel zooms · drag pans · Shift+wheel tilts.
// Touch:   one finger pans · pinch zooms · twist rotates · two fingers up/down tilt.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';

export interface CameraPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private pose: CameraPose;
  private goal: CameraPose;
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private terrain: Heightfield | null = null;
  private pivotY = 0;
  private follow: (() => THREE.Vector3 | null) | null = null;
  onUserMove: (() => void) | null = null;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, pose: CameraPose) {
    this.camera = camera;
    this.pose = { ...pose };
    this.goal = { ...pose };
    dom.style.touchAction = 'none';
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const release = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    dom.addEventListener('pointerup', release);
    dom.addEventListener('pointercancel', release);
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        const k = this.goal.distance * 0.0016;
        this.panLocal(-dx * k, dy * k);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        const other = a[0] === e.pointerId ? b[1] : a[1];
        const before = { dx: p.x - other.x, dy: p.y - other.y };
        const after = { dx: e.clientX - other.x, dy: e.clientY - other.y };
        const d0 = Math.hypot(before.dx, before.dy);
        const d1 = Math.hypot(after.dx, after.dy);
        if (d0 > 10 && d1 > 10) {
          // Pinch to zoom, twist to rotate, move both fingers vertically to tilt.
          this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (d0 / d1), 8, 260);
          const twist = Math.atan2(after.dy, after.dx) - Math.atan2(before.dy, before.dx);
          this.goal.yaw += Math.atan2(Math.sin(twist), Math.cos(twist));
          this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + (e.clientY - p.y) * 0.0025, 0.08, 1.4);
          this.userMoved(false);
        }
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.shiftKey) this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + e.deltaY * 0.0015, 0.08, 1.4);
        else this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (1 + e.deltaY * 0.0012), 8, 260);
      },
      { passive: false },
    );
  }

  setTerrain(t: Heightfield): void {
    this.terrain = t;
    this.pivotY = t.sample(this.pose.x, this.pose.z);
  }

  /** Follow a moving target (e.g. the airship); pass null to stop. */
  setFollow(target: (() => THREE.Vector3 | null) | null, distance?: number): void {
    this.follow = target;
    if (distance) this.goal.distance = distance;
  }

  get following(): boolean {
    return this.follow !== null;
  }

  private userMoved(stopFollow: boolean): void {
    if (stopFollow && this.follow) {
      this.follow = null;
      this.onUserMove?.();
    }
  }

  private panLocal(right: number, forward: number): void {
    this.userMoved(true);
    const s = Math.sin(this.goal.yaw);
    const c = Math.cos(this.goal.yaw);
    this.goal.x += c * right - s * forward;
    this.goal.z += -s * right - c * forward;
    if (this.terrain) {
      const lim = this.terrain.size / 2 - 10;
      this.goal.x = THREE.MathUtils.clamp(this.goal.x, -lim, lim);
      this.goal.z = THREE.MathUtils.clamp(this.goal.z, -lim, lim);
    }
  }

  get pivot(): THREE.Vector3 {
    return new THREE.Vector3(this.pose.x, this.pivotY, this.pose.z);
  }

  update(dt: number): void {
    const speed = this.goal.distance * 0.9 * dt;
    let r = 0;
    let f = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) f += speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) f -= speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) r += speed;
    if (this.keys.has('a') || this.keys.has('arrowleft')) r -= speed;
    if (r || f) this.panLocal(r, f);
    if (this.keys.has('q')) this.goal.yaw += dt * 1.1;
    if (this.keys.has('e')) this.goal.yaw -= dt * 1.1;

    let followY: number | null = null;
    if (this.follow) {
      const t = this.follow();
      if (t) {
        this.goal.x = t.x;
        this.goal.z = t.z;
        followY = t.y;
      }
    }

    const k = 1 - Math.exp(-dt * (this.follow ? 10 : 7));
    this.pose.x += (this.goal.x - this.pose.x) * k;
    this.pose.z += (this.goal.z - this.pose.z) * k;
    this.pose.yaw += (this.goal.yaw - this.pose.yaw) * k;
    this.pose.pitch += (this.goal.pitch - this.pose.pitch) * k;
    this.pose.distance += (this.goal.distance - this.pose.distance) * k;
    if (followY !== null) this.pivotY += (followY - this.pivotY) * k;
    else if (this.terrain) {
      const ground = Math.max(this.terrain.waterLevel, this.terrain.sample(this.pose.x, this.pose.z));
      this.pivotY += (ground - this.pivotY) * k;
    }

    const { yaw, pitch, distance } = this.pose;
    const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance);
    const target = this.pivot;
    this.camera.position.copy(target).add(offset);
    if (this.terrain) {
      const g = this.terrain.sample(this.camera.position.x, this.camera.position.z) + 2;
      if (this.camera.position.y < g) this.camera.position.y = g;
    }
    this.camera.lookAt(target);
  }
}
