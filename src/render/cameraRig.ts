// Management camera: orbits a pivot on the ground.
// WASD / arrows pan · Q/E rotate · wheel zooms · right- or middle-drag pans · Shift+wheel tilts.

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
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private terrain: Heightfield | null = null;
  private pivotY = 0;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, pose: CameraPose) {
    this.camera = camera;
    this.pose = { ...pose };
    this.goal = { ...pose };
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2 || e.button === 0) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const k = this.goal.distance * 0.0016;
      this.panLocal(-dx * k, dy * k);
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.shiftKey) {
          this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + e.deltaY * 0.0015, 0.32, 1.35);
        } else {
          this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (1 + e.deltaY * 0.0012), 12, 260);
        }
      },
      { passive: false },
    );
  }

  setTerrain(t: Heightfield): void {
    this.terrain = t;
    this.pivotY = t.sample(this.pose.x, this.pose.z);
  }

  private panLocal(right: number, forward: number): void {
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

    const k = 1 - Math.exp(-dt * 7);
    this.pose.x += (this.goal.x - this.pose.x) * k;
    this.pose.z += (this.goal.z - this.pose.z) * k;
    this.pose.yaw += (this.goal.yaw - this.pose.yaw) * k;
    this.pose.pitch += (this.goal.pitch - this.pose.pitch) * k;
    this.pose.distance += (this.goal.distance - this.pose.distance) * k;
    if (this.terrain) {
      const ground = Math.max(this.terrain.waterLevel, this.terrain.sample(this.pose.x, this.pose.z));
      this.pivotY += (ground - this.pivotY) * k;
    }

    const { yaw, pitch, distance } = this.pose;
    const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance);
    const target = this.pivot;
    this.camera.position.copy(target).add(offset);
    // Never dip below the ground.
    if (this.terrain) {
      const g = this.terrain.sample(this.camera.position.x, this.camera.position.z) + 2;
      if (this.camera.position.y < g) this.camera.position.y = g;
    }
    this.camera.lookAt(target);
  }
}
