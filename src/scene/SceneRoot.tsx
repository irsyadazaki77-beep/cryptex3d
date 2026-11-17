/**
 * SceneRoot: mounts the WebGLRenderer, runs the rAF loop, handles resize, and disposes
 * every GPU resource on unmount. The render loop never touches React state; it talks to
 * the rest of the app through `registry.events` (an EventTarget) and `sceneSignals`.
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './scene.css';
import WebGLFallback from './WebGLFallback';
import { SpatialKeySerializer } from './SpatialKeySerializer';
import { DEFAULT_ARTIFACTS } from './defaultArtifacts';
import { fitCameraDistance } from './cameraFraming';
import { createVaultEnvironment } from './environment';
import { createPostFx, type PostFx } from './postFx';
import { AdaptiveQuality } from './adaptiveQuality';
import { isPipelineActive } from './sceneSignals';
import { getGlitchLevel } from './sceneBridge';
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
/** How long to wait for the browser to restore a lost WebGL context before giving up. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 4000;
export const CONTEXT_LOST_REASON = 'WEBGL_CONTEXT_LOST';

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
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  /** Bumped to remount a fresh canvas + renderer after the context is restored. */
  const [epoch, setEpoch] = useState(0);
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

    // Procedural reflection environment so metallic artifacts have something to mirror (no external HDRI).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.35;
    registry.registerDisposable(envTarget);
    envScene.dispose();
    pmrem.dispose();

    // Obsidian Cyber-Vault lighting: deep indigo ambient, cool key, cyan rim, violet underfill.
    const ambient = new THREE.AmbientLight(0x312e81, 0.5);
    const key = new THREE.DirectionalLight(0xe0f2fe, 1.8);
    key.position.set(5, 6, 6);
    const rim = new THREE.DirectionalLight(0x22d3ee, 1.1);
    rim.position.set(-4, 3, -6);
    const fill = new THREE.PointLight(0xa855f7, 40, 0, 2);
    fill.position.set(-5, -3, 2);
    registry.add(ambient);
    registry.add(key);
    registry.add(rim);
    registry.add(fill);

    const environment = createVaultEnvironment(registry);

    let postFx: PostFx | null = null;
    let bloomActive = true;
    try {
      postFx = createPostFx(renderer, scene, camera, 1, 1);
    } catch {
      postFx = null; // plain renderer path below
    }
    const quality = new AdaptiveQuality(FRAME_BUDGET_MS);

    const resize = (): void => {
      const w = Math.max(1, canvas.clientWidth || window.innerWidth);
      const h = Math.max(1, canvas.clientHeight || window.innerHeight);
      renderer.setSize(w, h, false); // false: never write inline styles (CSP)
      postFx?.setSize(w, h);
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
    let activity = 0;
    let running = true;
    const loop = (now: number): void => {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
      const start = performance.now();
      const delta = now - last;
      last = now;
      // Ease the pipeline-activity signal (0..1) so glow changes never snap.
      const target = isPipelineActive() ? 1 : 0;
      activity += (target - activity) * (1 - Math.exp(-delta / 300));
      environment.update(delta, now, activity);
      registry.runFrame(delta, now);
      if (postFx && bloomActive) {
        postFx.setActivity(activity);
        postFx.setGlitch(getGlitchLevel());
        postFx.render(delta / 1000);
      } else {
        renderer.render(scene, camera);
      }
      const elapsed = performance.now() - start;
      quality.record(elapsed, delta);
      if (bloomActive && !quality.bloomEnabled) bloomActive = false;
      if (elapsed > FRAME_BUDGET_MS) {
        registry.events.dispatchEvent(
          new CustomEvent<FrameOverrunDetail>(SCENE_FRAME_OVERRUN_EVENT, {
            detail: { durationMs: elapsed },
          }),
        );
      }
    };
    rafId = requestAnimationFrame(loop);

    // WebGL context loss: pause, wait for restore, then remount; otherwise show the fallback.
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    const onContextLost = (e: Event): void => {
      e.preventDefault(); // required for the browser to attempt restoration
      running = false;
      cancelAnimationFrame(rafId);
      restoreTimer = setTimeout(() => {
        setFallbackReason(CONTEXT_LOST_REASON);
        setWebglUnavailable(true);
        propsRef.current.onWebGLUnavailable?.();
      }, CONTEXT_RESTORE_TIMEOUT_MS);
    };
    const onContextRestored = (): void => {
      if (restoreTimer !== undefined) clearTimeout(restoreTimer);
      restoreTimer = undefined;
      setEpoch((n) => n + 1); // fresh canvas + renderer + resources
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      if (restoreTimer !== undefined) clearTimeout(restoreTimer);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      observer.disconnect();
      for (const c of cleanups) c();
      registry.disposeAll();
      postFx?.dispose();
      renderer.dispose();
      const ref = propsRef.current.eventsRef;
      if (ref && ref.current === registry.events) ref.current = null;
    };
  }, [epoch]);

  if (webglUnavailable) return <WebGLFallback reason={fallbackReason} />;
  return (
    <canvas
      key={epoch}
      ref={canvasRef}
      className="scene-canvas"
      aria-label="Cryptex3D vault scene"
    />
  );
}
