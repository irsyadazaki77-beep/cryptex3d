import { useEffect, useState, type ChangeEvent } from 'react';
import { Download, FileImage, RotateCcw, Unlock } from 'lucide-react';
import { HudPanel } from './HudPanel';
import { useVaultStore } from '../store/vaultStore';
import {
  PASSPHRASE_MAX,
  PASSPHRASE_MIN,
  displayMessage,
  isRetryLimitReached,
  isValidPassphrase,
  nextAttempts,
} from './decryptLogic';
import { badgeWarning, btnPrimary as primaryBtn, btnSecondary as secondaryBtn, inputCls, labelCls } from './hudStyles';

const DOWNLOAD_NAME = 'cryptex3d-payload.bin';
const BUSY_STATES = new Set(['extracting', 'decrypting']);

export function DecryptPanel({ className }: { className?: string }) {
  const stegoCarrier = useVaultStore((s) => s.stegoCarrier);
  const decryptStatus = useVaultStore((s) => s.decryptStatus);
  const decryptedPayload = useVaultStore((s) => s.decryptedPayload);
  const lastError = useVaultStore((s) => s.lastError);

  const [passphrase, setPassphrase] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  // Attempts are tied to the carrier object they were made against.
  const [tally, setTally] = useState<{ carrier: Uint8Array | null; attempts: number }>({
    carrier: null,
    attempts: 0,
  });
  const attempts = tally.carrier === stegoCarrier ? tally.attempts : 0;
  const locked = isRetryLimitReached(attempts);

  const complete = decryptStatus.state === 'complete';
  const errored = decryptStatus.state === 'error';
  const busy = BUSY_STATES.has(decryptStatus.state);

  useEffect(() => {
    if (!complete || !decryptedPayload) {
      setDownloadUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([decryptedPayload as BlobPart], { type: 'application/octet-stream' }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [complete, decryptedPayload]);

  const passphraseValid = isValidPassphrase(passphrase);
  const canSubmit = passphraseValid && stegoCarrier !== null && !busy && !locked;

  async function handleCarrierFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { setStegoCarrier, setDecryptedPayload, setLastError, setPipelineState } =
      useVaultStore.getState();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setDecryptedPayload(null);
      setLastError(null);
      setPipelineState('decrypt', 'idle');
      setStegoCarrier(bytes);
      setLoadError(null);
    } catch {
      setLoadError('Carrier file could not be read.');
    }
  }

  async function handleExtract(): Promise<void> {
    if (!canSubmit) return;
    const carrierAtStart = stegoCarrier;
    await useVaultStore.getState().dispatchExtractDecrypt(passphrase);
    const state = useVaultStore.getState();
    if (state.stegoCarrier !== carrierAtStart) return;
    const code = state.decryptStatus.state === 'error' ? state.lastError : null;
    setTally((t) => ({
      carrier: carrierAtStart,
      attempts: nextAttempts(t.carrier === carrierAtStart ? t.attempts : 0, code),
    }));
  }

  function handleReset(): void {
    const s = useVaultStore.getState();
    s.setDecryptedPayload(null);
    s.setLastError(null);
    s.setStegoCarrier(null);
    s.setPipelineState('decrypt', 'idle', { progressBytes: 0, totalBytes: 0 });
    setPassphrase('');
    setTally({ carrier: null, attempts: 0 });
  }

  const message = errored || locked ? displayMessage(attempts, lastError) : null;

  return (
    <HudPanel
      title="Decrypt"
      icon={<Unlock size={16} />}
      defaultCollapsed
      className={className}
    >
      <div className="flex flex-col gap-3">
        <label className={labelCls}>
          Carrier PNG
          <span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm normal-case tracking-normal text-slate-200 transition-colors duration-200 hover:border-slate-600 focus-within:border-indigo-400">
            <FileImage size={16} />
            <span className="flex-1 truncate">
              {stegoCarrier ? `Carrier loaded (${stegoCarrier.byteLength} bytes)` : 'Load carrier from file'}
            </span>
            <input
              type="file"
              accept="image/png"
              className="sr-only"
              onChange={(e) => void handleCarrierFile(e)}
            />
          </span>
        </label>
        {loadError && (
          <p role="alert" className="text-sm text-rose-400">
            {loadError}
          </p>
        )}

        <label className={labelCls}>
          Passphrase
          <input
            type="password"
            autoComplete="off"
            minLength={PASSPHRASE_MIN}
            maxLength={PASSPHRASE_MAX}
            value={passphrase}
            disabled={locked}
            onChange={(e) => setPassphrase(e.target.value)}
            className={`${inputCls} h-11`}
          />
        </label>
        {passphrase.length > 0 && !passphraseValid && (
          <p className={badgeWarning}>
            Passphrase must be {PASSPHRASE_MIN}–{PASSPHRASE_MAX} characters.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primaryBtn}
            disabled={!canSubmit}
            onClick={() => void handleExtract()}
          >
            <Unlock size={16} />
            Extract &amp; Decrypt
          </button>
          {locked && (
            <button type="button" className={secondaryBtn} onClick={handleReset}>
              <RotateCcw size={16} />
              Re-initiate
            </button>
          )}
        </div>

        {busy && (
          <p className="font-mono text-xs uppercase tracking-widest text-slate-200/55">
            {decryptStatus.state}
          </p>
        )}

        {message && (
          <p role="alert" className="text-sm text-rose-400">
            {message}
          </p>
        )}
        {errored && !locked && attempts > 0 && (
          <p className="font-mono text-xs text-slate-200/55">
            Attempt {attempts} of 10
          </p>
        )}

        {complete && downloadUrl && (
          <a
            href={downloadUrl}
            download={DOWNLOAD_NAME}
            className={`${secondaryBtn} border-emerald-500/40 text-emerald-400 no-underline`}
          >
            <Download size={16} />
            Download decrypted file
          </a>
        )}
      </div>
    </HudPanel>
  );
}

export default DecryptPanel;
