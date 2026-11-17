import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { PointerRouter, type ArtifactHit } from '../src/scene/controls/ArtifactRaycaster';
import type { ArtifactInteraction } from '../src/scene/artifacts/types';

function setup() {
  const log: string[] = [];
  const mk = (id: ArtifactInteraction['id']): ArtifactInteraction => ({
    id,
    object: {} as THREE.Object3D,
    onPointerDown: () => log.push(`${id}:down`),
    onPointerMove: () => log.push(`${id}:move`),
    onPointerUp: () => log.push(`${id}:up`),
    onPointerEnter: () => log.push(`${id}:enter`),
    onPointerLeave: () => log.push(`${id}:leave`),
    onClick: () => log.push(`${id}:click`),
  });
  const monolith = mk('monolith');
  const crystal = mk('crystal');
  const ring = mk('ring');
  let current: ArtifactInteraction | null = null;
  const hitTest = (): ArtifactHit | null =>
    current ? { interaction: current, hit: { distance: 1 } as THREE.Intersection } : null;
  let enabled = true;
  const orbit = { enable: () => (enabled = true), disable: () => (enabled = false) };
  const router = new PointerRouter(hitTest, orbit);
  const ev = { clientX: 0, clientY: 0, movementX: 0, movementY: 0 };
  return { log, monolith, crystal, ring, router, ev, setHit: (i: ArtifactInteraction | null) => (current = i), isEnabled: () => enabled };
}

describe('PointerRouter', () => {
  it('captures monolith drag, disables orbit, re-enables on pointer up', () => {
    const s = setup();
    s.setHit(s.monolith);
    s.router.pointerDown(s.ev);
    expect(s.isEnabled()).toBe(false);
    s.setHit(null);
    s.router.pointerMove(s.ev);
    expect(s.log).toContain('monolith:move');
    s.router.pointerUp(s.ev);
    expect(s.isEnabled()).toBe(true);
    expect(s.router.getCaptured()).toBeNull();
  });

  it('disables orbit on crystal hover and re-enables on leave', () => {
    const s = setup();
    s.setHit(s.crystal);
    s.router.pointerMove(s.ev);
    expect(s.log).toEqual(['crystal:enter', 'crystal:move']);
    expect(s.isEnabled()).toBe(false);
    s.setHit(null);
    s.router.pointerMove(s.ev);
    expect(s.log).toContain('crystal:leave');
    expect(s.isEnabled()).toBe(true);
  });

  it('routes ring click and keeps orbit enabled on plain ring hover', () => {
    const s = setup();
    s.setHit(s.ring);
    s.router.pointerMove(s.ev);
    expect(s.isEnabled()).toBe(true);
    s.router.click(s.ev);
    expect(s.log).toContain('ring:click');
  });

  it('reset releases capture and re-enables orbit', () => {
    const s = setup();
    s.setHit(s.ring);
    s.router.pointerDown(s.ev);
    s.router.reset();
    expect(s.isEnabled()).toBe(true);
    expect(s.router.getHovered()).toBeNull();
  });
});
