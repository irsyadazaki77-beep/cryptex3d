/**
 * Post-processing: RenderPass -> UnrealBloomPass -> OutputPass. The bloom threshold sits above
 * normal lit surfaces, so only HDR emissive elements (runes, active ring segments, crystal
 * core) glow. OutputPass applies the renderer's tone mapping and colour-space conversion.
 * No React and no store imports.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

export const BLOOM_BASE_STRENGTH = 0.28;
export const BLOOM_ACTIVE_BOOST = 0.35;
const BLOOM_RADIUS = 0.4;
const BLOOM_THRESHOLD = 1.0;

export interface PostFx {
  render(deltaSeconds: number): void;
  setSize(width: number, height: number): void;
  /** Scale bloom strength; 0 = base strength, 1 = full pipeline-active boost. */
  setActivity(activity: number): void;
  /** 0..1 glitch intensity for the tripwire effect; the RGB-split pass is skipped entirely at 0. */
  setGlitch(level: number): void;
  dispose(): void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): PostFx {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM_BASE_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  const glitchPass = new ShaderPass(RGBShiftShader);
  glitchPass.enabled = false;
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(glitchPass);
  composer.addPass(outputPass);
  composer.setSize(width, height);
  return {
    render: (deltaSeconds) => composer.render(deltaSeconds),
    setSize: (w, h) => composer.setSize(w, h),
    setActivity: (a) => {
      bloomPass.strength = BLOOM_BASE_STRENGTH + BLOOM_ACTIVE_BOOST * Math.min(1, Math.max(0, a));
    },
    setGlitch: (level) => {
      const on = level > 0.002;
      glitchPass.enabled = on;
      if (on) {
        glitchPass.uniforms.amount.value = Math.min(1, level) * 0.018;
        glitchPass.uniforms.angle.value = (level * 40) % (Math.PI * 2);
      }
    },
    dispose: () => {
      renderPass.dispose();
      bloomPass.dispose();
      glitchPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}
