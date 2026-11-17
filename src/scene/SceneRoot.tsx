/**
 * SceneRoot: mounts the WebGLRenderer, runs the rAF loop, handles resize, and disposes
 * every GPU resource on unmount. The render loop never touches React state; it talks to
 * the rest of the app through `registry.events` (an EventTarget).
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import './scene.css';
import WebGLFallback from './WebGLFallback';
import { SpatialKeySerializer } from './SpatialKeySerializer';
import { DEFAULT_ARTIFACTS } from './defaultArtifacts';
import { fitCameraDistance } from './cameraFraming';
import {
  SCENE_FRAME_OVERRUN_EVENT,
  SCENE_READY_EVENT,
  SceneRegistry,
  type ArtifactFactory,
  type FrameOverrunDetail,
} from './sceneRegistry';

export const VOID_BACKGROUND = 0x060810;
/** Main-thread budget per frame for scene work (callbacks + render submit). */
export const FRAME_BUDGET_MS = 4;

const DUST_COUNT = 280;
/** Radians per millisecond (~one revolution every 7 minutes). */
const DUST_DRIFT_PER_MS = 0.000015;

/** Seeded LCG so the field looks identical across loads (visual only, not security-relevant). */
function createDustField(count: number): {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
} {
  let seed = 0x2f6e2b1;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform direction on a sphere, radius 12-30 so dust surrounds the framed artifacts.
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 12 + rand() * 18;
    positions[i * 3] = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xa5b4fc,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    fog: false,
  });
  return { points: new THREE.Points(geometry, material), geometry, material };
}

export interface SceneRootProps {
  /** Receives the scene event emitter once mounted (and null after unmount). */
  eventsRef?: RefObject<EventTarget | null>;
  /** Callback form of the emitter/registry; called after artifacts are mounted. */
  onSceneReady?: (registry: SceneRegistry) => void;
  /** Artifact factories mounted once at scene creation, in order. */
  artifacts?: readonly ArtifactFactory[];
  /** Called when WebGL could not be initialised. */
  onWebGLUnavailable?: () => void;
}

export default function SceneRoot({
  eventsRef,
  onSceneReady,
  artifacts,
  onWebGLUnavailable,
}: SceneRootProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  // Latest props without re-creating the renderer when callers pass new identities.
  const propsRef = useRef({ eventsRef, onSceneReady, artifacts, onWebGLUnavailable });
  propsRef.current = { eventsRef, onSceneReady, artifacts, onWebGLUnavailable };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      const gl = canvas.getContext('webgl2');
      if (!gl) throw new Error('webgl2-unavailable');
      renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    } catch {
      setWebglUnavailable(true);
      propsRef.current.onWebGLUnavailable?.();
      return;
    }

    renderer.setClearColor(VOID_BACKGROUND, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(VOID_BACKGROUND);
    scene.fog = new THREE.FogExp2(VOID_BACKGROUND, 0.035);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

    const registry = new SceneRegistry(scene);
    // Obsidian Cyber-Vault lighting: deep indigo ambient, cool key, cyan rim, violet underfill.
    const ambient = new THREE.AmbientLight(0x312e81, 0.5);
    const key = new THREE.DirectionalLight(0xe0f2fe, 1.8);
    key.position.set(5, 6, 6);
    const rim = new THREE.DirectionalLight(0x22d3ee, 2.2);
    rim.position.set(-4, 3, -6);
    const fill = new THREE.PointLight(0xa855f7, 40, 0, 2);
    fill.position.set(-5, -3, 2);
    registry.add(ambient);
    registry.add(key);
    registry.add(rim);
    registry.add(fill);
    // Ambient dust: static seeded points with a very slow drift (one rotation write per frame).
    const dust = createDustField(DUST_COUNT);
    registry.add(dust.points, dust.geometry, dust.material);
    registry.onFrame((delta) => {
      dust.points.rotation.y += delta * DUST_DRIFT_PER_MS;
    });

    const resize = (): void => {
      const w = Math.max(1, canvas.clientWidth || window.innerWidth);
      const h = Math.max(1, canvas.clientHeight || window.innerHeight);
      renderer.setSize(w, h, false); // false: never write inline styles (CSP)
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Keep all three artifacts framed; preserve the current orbit direction.
      const dist = fitCameraDistance(camera.fov, camera.aspect);
      camera.position.setLength(dist);
    };
    camera.position.set(0, 0.2, 1);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const cleanups: Array<() => void> = [];

    // Attach before artifacts mount so their initial state emits are serialized.
    const serializer = new SpatialKeySerializer();
    serializer.attach(registry.events);
    cleanups.push(() => serializer.detach());

    for (const factory of propsRef.current.artifacts ?? DEFAULT_ARTIFACTS) {
      const cleanup = factory({ registry, scene, camera, canvas, events: registry.events });
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }

    const evRef = propsRef.current.eventsRef;
    if (evRef) evRef.current = registry.events;
    propsRef.current.onSceneReady?.(registry);
    registry.events.dispatchEvent(new Event(SCENE_READY_EVENT));

    let rafId = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      rafId = requestAnimationFrame(loop);
      const start = performance.now();
      const delta = now - last;
      last = now;
      registry.runFrame(delta, now);
      renderer.render(scene, camera);
      const elapsed = performance.now() - start;
      if (elapsed > FRAME_BUDGET_MS) {
        registry.events.dispatchEvent(
          new CustomEvent<FrameOverrunDetail>(SCENE_FRAME_OVERRUN_EVENT, {
            detail: { durationMs: elapsed },
          }),
        );
      }
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      for (const c of cleanups) c();
      registry.disposeAll();
      renderer.dispose();
      const ref = propsRef.current.eventsRef;
      if (ref && ref.current === registry.events) ref.current = null;
    };
  }, []);

  if (webglUnavailable) return <WebGLFallback />;
  return <canvas ref={canvasRef} className="scene-canvas" aria-label="Cryptex3D vault scene" />;
}
