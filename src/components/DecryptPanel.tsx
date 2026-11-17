import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Download,
  FileAudio,
  FileImage,
  FileJson,
  FileUp,
  Network,
  ShieldAlert,
  Trash2,
  Unlock,
} from 'lucide-react';
import { HudPanel } from './HudPanel';
import { useVaultStore } from '../store/vaultStore';
import { TRIPWIRE_LIMIT } from '../store/tripwire';
import type { ShardKind } from '../store/types';
import { PASSPHRASE_MAX, PASSPHRASE_MIN, isValidPassphrase, messageForError } from './decryptLogic';
import { MAX_SHARD_FILE_BYTES, SHARD_LABEL, detectShardKind } from './shardKind';
import { formatExpiry } from './ttlOptions';
import { badgeWarning, btnPrimary, btnSecondary, inputCls, labelCls } from './hudStyles';

const DOWNLOAD_NAME = 'cryptex3d-payload.bin';
const BUSY_STATES = new Set(['extracting', 'decrypting']);
type Mode = 'standard' | 'horcrux';

const SHARD_ICON: Record<ShardKind, typeof FileImage> = {
  png: FileImage,
  wav: FileAudio,
  token: FileJson,
};

export function DecryptPanel({ className }: { className?: string }) {
  const stegoCarrier = useVaultStore((s) => s.stegoCarrier);
  const decryptShards = useVaultStore((s) => s.decryptShards);
  const decryptStatus = useVaultStore((s) => s.decryptStatus);
  const decryptedPayload = useVaultStore((s) => s.decryptedPayload);
  const decryptExpiresAt = useVaultStore((s) => s.decryptExpiresAt);
  const lastError = useVaultStore((s) => s.lastError);
  const tripwire = useVaultStore((s) => s.tripwire);
  const addDecryptShard = useVaultStore((s) => s.addDecryptShard);
  const removeDecryptShard = useVaultStore((s) => s.removeDecryptShard);
  const clearDecryptShards = useVaultStore((s) => s.clearDecryptShards);

  const [mode, setMode] = useState<Mode>('standard');
  const [passphrase, setPassphrase] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const shardInput = useRef<HTMLInputElement>(null);

  const complete = decryptStatus.state === 'complete';
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

  // A tripped tripwire wipes the buffers; clear the typed passphrase too.
  useEffect(() => {
    if (tripwire.tripped) setPassphrase('');
  }, [tripwire.tripped]);

  const passphraseValid = isValidPassphrase(passphrase);
  const canSubmitStandard = passphraseValid && stegoCarrier !== null && !busy;
  const canSubmitHorcrux = passphraseValid && decryptShards.length >= 2 && !busy;

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

  async function handleShardFiles(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const { setDecryptedPayload, setLastError, setPipelineState } = useVaultStore.getState();
    setDecryptedPayload(null);
    setLastError(null);
    setPipelineState('decrypt', 'idle');
    let problem: string | null = null;
    for (const file of files) {
      if (file.size > MAX_SHARD_FILE_BYTES) {
        problem = `${file.name} is too large to be a shard.`;
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const kind = detectShardKind(bytes);
        if (kind === null) problem = `${file.name} is not a PNG, WAV or JSON shard.`;
        else addDecryptShard({ kind, name: file.name, bytes });
      } catch {
        problem = `${file.name} could not be read.`;
      }
    }
    setLoadError(problem);
  }

  async function handleExtract(): Promise<void> {
    if (!canSubmitStandard) return;
    await useVaultStore.getState().dispatchExtractDecrypt(passphrase);
  }

  async function handleRecover(): Promise<void> {
    if (!canSubmitHorcrux) return;
    await useVaultStore.getState().dispatchHorcruxRecover(passphrase);
  }

  const errored = decryptStatus.state === 'error';
  const message = errored || tripwire.tripped ? messageForError(lastError) : null;
  const armed = TRIPWIRE_LIMIT - tripwire.failures;

  return (
    <HudPanel title="Decrypt" icon={<Unlock size={16} />} defaultCollapsed className={className}>
      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label="Decrypt mode"
          className="grid grid-cols-2 gap-1 rounded-lg border border-slate-700/60 bg-slate-950/60 p-1"
        >
          {(['standard', 'horcrux'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium uppercase tracking-widest transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                mode === m ? 'bg-indigo-500/25 text-white' : 'text-slate-200/55 hover:text-slate-200'
              }`}
            >
              {m === 'horcrux' && <Network size={16} aria-hidden="true" />}
              {m === 'standard' ? 'Single carrier' : 'Horcrux'}
            </button>
          ))}
        </div>

        {mode === 'standard' ? (
          <label className={labelCls}>
            Carrier PNG
            <span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm normal-case tracking-normal text-slate-200 transition-colors duration-200 hover:border-slate-600 focus-within:border-indigo-400">
              <FileImage size={16} />
              <span className="flex-1 truncate">
                {stegoCarrier
                  ? `Carrier loaded (${stegoCarrier.byteLength} bytes)`
                  : 'Load carrier from file'}
              </span>
              <input
                type="file"
                accept="image/png"
                className="sr-only"
                onChange={(e) => void handleCarrierFile(e)}
              />
            </span>
          </label>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={`${btnSecondary} justify-start`}
              onClick={() => shardInput.current?.click()}
            >
              <FileUp size={16} />
              Add shard files (PNG, WAV, JSON)
            </button>
            <input
              ref={shardInput}
              type="file"
              multiple
              accept=".png,.wav,.json,image/png,audio/wav,audio/x-wav,application/json"
              className="sr-only"
              aria-label="Shard files"
              onChange={(e) => void handleShardFiles(e)}
            />
            <p className="m-0 font-mono text-xs text-slate-200/55">
              {decryptShards.length} of 3 shards loaded. Any 2 recover the file.
            </p>
            {decryptShards.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Loaded shards">
                {decryptShards.map((s) => {
                  const Icon = SHARD_ICON[s.kind];
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm"
                    >
                      <Icon size={16} className="text-cyan-300" aria-hidden="true" />
                      <span className="flex-1 truncate">
                        {SHARD_LABEL[s.kind]}
                        <span className="ml-2 font-mono text-xs text-slate-200/55">{s.name}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${s.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-200/55 transition-colors hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                        onClick={() => removeDecryptShard(s.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {decryptShards.length === 1 && (
              <p className={badgeWarning}>One shard on its own reveals nothing. Add a second.</p>
            )}
            <p className="m-0 text-xs text-slate-200/55">
              The ring token also needs the Cryptex Ring dialled to the sealed positions.
            </p>
          </div>
        )}

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
            onChange={(e) => setPassphrase(e.target.value)}
            className={`${inputCls} h-11`}
          />
        </label>
        {passphrase.length > 0 && !passphraseValid && (
          <p className={badgeWarning}>
            Passphrase must be {PASSPHRASE_MIN} to {PASSPHRASE_MAX} characters.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'standard' ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={!canSubmitStandard}
              onClick={() => void handleExtract()}
            >
              <Unlock size={16} />
              Extract &amp; Decrypt
            </button>
          ) : (
            <>
              <button
                type="button"
                className={btnPrimary}
                disabled={!canSubmitHorcrux}
                onClick={() => void handleRecover()}
              >
                <Network size={16} />
                Recover from shards
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={decryptShards.length === 0}
                onClick={clearDecryptShards}
              >
                <Trash2 size={16} />
                Clear
              </button>
            </>
          )}
        </div>

        {busy && (
          <p className="font-mono text-xs uppercase tracking-widest text-slate-200/55">
            {decryptStatus.state}
          </p>
        )}

        <div
          role="status"
          data-testid="tripwire-status"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs ${
            tripwire.tripped
              ? 'border-rose-500/50 bg-rose-500/10 text-rose-400 shadow-[0_0_20px_rgba(239,68,68,0.7)]'
              : tripwire.failures > 0
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                : 'border-slate-700/60 bg-slate-950/60 text-slate-200/55'
          }`}
        >
          <ShieldAlert size={16} aria-hidden="true" />
          {tripwire.tripped
            ? tripwire.reason === 'expired'
              ? 'SELF-DESTRUCT: drop expired, buffers overwritten'
              : 'TRIPWIRE TRIGGERED: buffers overwritten'
            : `Tripwire armed: ${armed} of ${TRIPWIRE_LIMIT} attempts left`}
        </div>

        {message && (
          <p role="alert" className="text-sm text-rose-400">
            {message}
          </p>
        )}

        {complete && decryptExpiresAt !== null && (
          <p className="m-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-400">
            This drop self-destructs {formatExpiry(decryptExpiresAt)}.
          </p>
        )}

        {complete && downloadUrl && (
          <a
            href={downloadUrl}
            download={DOWNLOAD_NAME}
            className={`${btnSecondary} border-emerald-500/40 text-emerald-400 no-underline`}
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
