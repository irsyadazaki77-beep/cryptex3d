/**
 * Real dependencies for Judge Demo Mode: reuse the store's pipeline dispatchers
 * (no crypto duplicated here) and move the carrier over BroadcastChannel
 * using two BroadcastChannelFallback instances in the same tab.
 */
import { useVaultStore } from '../store/vaultStore';
import { SpatialKeySerializer } from '../scene/SpatialKeySerializer';
import { BroadcastChannelFallback, BROADCAST_CHANNEL_NAME } from '../core/p2p/BroadcastChannelFallback';
import { DEMO_SPATIAL_KEY, type DemoDeps, type DemoPhase } from './demoOrchestration';

const FAIL = 'DEMO_STEP_FAILED';

function failure(): Error & { code: string } {
  const code = useVaultStore.getState().lastError ?? FAIL;
  return Object.assign(new Error(code), { code });
}

export function createDefaultDemoDeps(onPhase: (phase: DemoPhase) => void): DemoDeps {
  const store = useVaultStore;
  let sender: BroadcastChannelFallback | null = null;
  let receiver: BroadcastChannelFallback | null = null;

  const closeChannels = (): void => {
    sender?.close();
    receiver?.close();
    sender = null;
    receiver = null;
  };

  return {
    onPhase,
    onAbort: () => {
      closeChannels();
      const s = store.getState();
      s.setPipelineState('encrypt', 'idle');
      s.setPipelineState('decrypt', 'idle');
    },
    async setSpatialKey() {
      const s = store.getState();
      s.setLastError(null);
      s.setDecryptedPayload(null);
      s.setStegoCarrier(null);
      s.setPipelineState('encrypt', 'idle');
      s.setPipelineState('decrypt', 'idle');
      const snapshot = await new SpatialKeySerializer().serialize(
        [...DEMO_SPATIAL_KEY.monolithRot],
        [...DEMO_SPATIAL_KEY.ringSegments],
        DEMO_SPATIAL_KEY.crystalActivated,
      );
      s.setSpatialKeySnapshot(snapshot);
    },
    async encryptEmbed(payload, passphrase) {
      await store.getState().dispatchEncryptEmbed(payload, passphrase);
      if (store.getState().encryptStatus.state !== 'complete') throw failure();
    },
    transfer(signal) {
      return new Promise<void>((resolve, reject) => {
        const carrier = store.getState().stegoCarrier;
        if (!carrier) {
          reject(failure());
          return;
        }
        // Stage label for the step that has no pipeline-runner counterpart.
        store.getState().setPipelineState('encrypt', 'transferring', {
          progressBytes: 0,
          totalBytes: carrier.length,
        });
        const tx = new BroadcastChannelFallback(BROADCAST_CHANNEL_NAME);
        const rx = new BroadcastChannelFallback(BROADCAST_CHANNEL_NAME);
        sender = tx;
        receiver = rx;
        const onAbort = (): void => {
          closeChannels();
          reject(new Error('ABORTED'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        rx.on('received', (bytes) => {
          signal.removeEventListener('abort', onAbort);
          store.getState().setStegoCarrier(bytes);
          store.getState().setPipelineState('encrypt', 'complete', {
            progressBytes: bytes.length,
            totalBytes: bytes.length,
          });
          closeChannels();
          resolve();
        });
        try {
          rx.activateFallback();
          tx.activateFallback();
          tx.send(carrier);
        } catch {
          signal.removeEventListener('abort', onAbort);
          closeChannels();
          reject(new Error('BROADCAST_CHANNEL_UNAVAILABLE'));
        }
      });
    },
    async extractDecrypt(passphrase) {
      await store.getState().dispatchExtractDecrypt(passphrase);
      const s = store.getState();
      if (s.decryptStatus.state !== 'complete' || !s.decryptedPayload) throw failure();
      return s.decryptedPayload;
    },
  };
}
