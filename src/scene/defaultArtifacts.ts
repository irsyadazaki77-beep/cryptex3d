/**
 * Default factory list. Artifacts mount first; controls are installed after them so
 * interactions are already registered; the audio bridge is lazy and last.
 */
import type { ArtifactFactory } from './sceneRegistry';
import { createObsidianMonolith } from './artifacts/ObsidianMonolith';
import { createCryptexRing } from './artifacts/CryptexRing';
import { createEtherealCrystal } from './artifacts/EtherealCrystal';
import { createCarrierFace } from './artifacts/CarrierFace';
import { createShatterEffect } from './artifacts/ShatterEffect';
import { controlsFactory } from './controls/ArtifactRaycaster';
import { audioBridgeFactory } from './audioBridge';

export const DEFAULT_ARTIFACTS: readonly ArtifactFactory[] = [
  createObsidianMonolith,
  createCryptexRing,
  createEtherealCrystal,
  createCarrierFace,
  createShatterEffect,
  controlsFactory,
  audioBridgeFactory,
];
