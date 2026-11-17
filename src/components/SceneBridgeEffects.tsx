import { useEffect } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { fireSceneEffect, setCarrierPreview } from '../scene/sceneBridge';
import { overwriteWithRandom } from '../core/shared/secureWipe';

/**
 * Headless bridge from store changes to the 3D scene:
 *  - the current carrier (or the first Horcrux PNG shard) is decoded in a worker and handed
 *    to the Monolith's carrier face for the X-Ray lens;
 *  - a tripwire or expiry trip fires the shatter/glitch effect;
 *  - a freshly sealed Horcrux set pulses the Cryptex Ring.
 * It renders nothing and never sees passphrases or key material.
 */
export function SceneBridgeEffects(): null {
  useEffect(() => {
    let disposed = false;
    let seq = 0;

    const apply = (carrier: Uint8Array | null): void => {
      const mine = ++seq;
      if (!carrier) {
        setCarrierPreview(null);
        return;
      }
      void import('../core/carrierPreview')
        .then((m) => m.inspectCarrier(carrier))
        .then((r) => {
          if (disposed || mine !== seq) {
            overwriteWithRandom(r.pixels); // stale result: do not keep a copy around
            return;
          }
          setCarrierPreview(r);
        })
        .catch(() => {
          if (!disposed && mine === seq) setCarrierPreview(null);
        });
    };

    const pick = (s: ReturnType<typeof useVaultStore.getState>): Uint8Array | null =>
      s.stegoCarrier ?? s.horcruxShards?.monolithPng ?? null;

    let current = pick(useVaultStore.getState());
    apply(current);
    const unsubscribe = useVaultStore.subscribe((s, prev) => {
      const next = pick(s);
      if (next !== current) {
        current = next;
        apply(next);
      }
      if (!prev.tripwire.tripped && s.tripwire.tripped) fireSceneEffect('shatter');
      if (s.horcruxShards && s.horcruxShards !== prev.horcruxShards) fireSceneEffect('ring-seal');
    });
    return () => {
      disposed = true;
      unsubscribe();
      setCarrierPreview(null);
    };
  }, []);
  return null;
}

export default SceneBridgeEffects;
