import { useSyncExternalStore } from 'react';
import { ScanEye } from 'lucide-react';
import { HudSwitch } from './HudPanel';
import {
  getCarrierPreview,
  getSceneBridgeVersion,
  getXrayLens,
  setXrayLens,
  subscribeSceneBridge,
} from '../scene/sceneBridge';

/**
 * Bit-plane X-Ray lens. Normal View shows the carrier as an ordinary dark plate on the
 * Obsidian Monolith; X-Ray View paints its LSB plane neon so judges can see where the
 * hidden payload lives. The lens only flips a flag the render loop reads; it never touches
 * the carrier bytes.
 */
export function XRayLensToggle() {
  useSyncExternalStore(subscribeSceneBridge, getSceneBridgeVersion);
  const on = getXrayLens();
  const preview = getCarrierPreview();
  const totalBits = preview ? preview.width * preview.height * 3 : 0;
  const share =
    preview && preview.payloadBits !== null && totalBits > 0
      ? Math.max(0.1, (preview.payloadBits / totalBits) * 100)
      : null;

  return (
    <div className="pointer-events-auto flex w-64 flex-col gap-2 rounded-xl border border-cyan-400/25 bg-[#0a0f1d]/75 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <HudSwitch
        checked={on}
        onChange={setXrayLens}
        label="X-Ray LSB Lens"
        description={on ? 'Showing the hidden bit-plane' : 'Normal view'}
        icon={<ScanEye size={16} />}
      />
      {on && (
        <div className="flex flex-col gap-1.5 px-1 pb-1 text-xs text-slate-200/80" data-testid="xray-legend">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" aria-hidden="true" />
            <span>LSB = 1</span>
            <span className="ml-2 h-2.5 w-2.5 rounded-sm bg-fuchsia-500" aria-hidden="true" />
            <span>LSB = 0</span>
          </div>
          {preview === null ? (
            <p className="m-0 text-slate-200/55">
              Placeholder plate. Encrypt or load a carrier to inspect a real payload.
            </p>
          ) : share === null ? (
            <p className="m-0 text-slate-200/55">No Cryptex3D payload found in this carrier.</p>
          ) : (
            <p className="m-0 font-mono text-slate-200/80">
              Payload: {share.toFixed(1)}% of the LSB plane (bright region)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default XRayLensToggle;
