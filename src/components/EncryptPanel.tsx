import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileUp, Flame, Lock, Network } from 'lucide-react';
import { HudPanel, HudSwitch } from './HudPanel';
import { useVaultStore } from '../store/vaultStore';
import { validateFileSize, validateHorcruxSize, validatePassphrase } from './encryptValidation';
import { btnPrimary, inputCls, labelCls } from './hudStyles';
import { TTL_OPTIONS, formatExpiry, ttlFor } from './ttlOptions';
import { HorcruxShardList } from './HorcruxShardList';

/** Encrypt & embed panel: file drop zone, passphrase, dead-drop options, dispatch to the vault store. */
export function EncryptPanel() {
  const dispatchEncryptEmbed = useVaultStore((s) => s.dispatchEncryptEmbed);
  const state = useVaultStore((s) => s.encryptStatus.state);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [dragging, setDragging] = useState(false);
  const [horcrux, setHorcrux] = useState(false);
  const [ttlId, setTtlId] = useState('none');
  const [armedExpiry, setArmedExpiry] = useState<number | null>(null);

  const busy = state !== 'idle' && state !== 'complete' && state !== 'error';
  const passphraseError = passphrase.length > 0 ? validatePassphrase(passphrase) : null;
  const modeError = file && horcrux ? validateHorcruxSize(file.size) : null;
  const canSubmit =
    file !== null &&
    fileError === null &&
    modeError === null &&
    validatePassphrase(passphrase) === null &&
    !busy;

  const acceptFile = (f: File | undefined): void => {
    if (!f) return;
    const err = validateFileSize(f.size);
    setFileError(err);
    setFile(err ? null : f);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  };
  const onInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    acceptFile(e.target.files?.[0]);
    e.target.value = '';
  };
  const onSubmit = async (): Promise<void> => {
    if (!canSubmit || !file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const secret = passphrase;
    const ttlMs = ttlFor(ttlId);
    setPassphrase('');
    // Horcrux sets announce their own expiry inside the shard list.
    setArmedExpiry(ttlMs === undefined || horcrux ? null : Date.now() + ttlMs);
    await dispatchEncryptEmbed(bytes, secret, { ttlMs, horcrux });
  };

  const shownError = fileError ?? modeError;

  return (
    <HudPanel title="Encrypt" icon={<Lock size={16} />} className="w-full">
      <div className="flex flex-col gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Select a file to encrypt"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center text-sm text-slate-200/55 transition-colors duration-200 hover:border-indigo-400/70 hover:bg-indigo-500/5 focus-visible:border-indigo-400 focus-visible:outline-none ${
            dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700/60 bg-slate-950/60'
          }`}
        >
          <FileUp size={20} />
          <span className="font-mono break-all">
            {file ? `${file.name} (${file.size} B)` : 'Drop a file or click to select'}
          </span>
          <input ref={inputRef} type="file" className="hidden" onChange={onInputChange} />
        </div>
        {shownError && (
          <p role="alert" className="text-sm text-rose-400">
            {shownError}
          </p>
        )}
        <label className={labelCls}>
          Passphrase
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={128}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            className={`${inputCls} h-11`}
          />
        </label>
        {passphraseError && (
          <p role="alert" className="text-sm text-rose-400">
            {passphraseError}
          </p>
        )}

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={busy}>
          <legend className="mb-1 p-0 text-xs uppercase tracking-widest text-slate-200/55">
            Dead-drop options
          </legend>
          <HudSwitch
            checked={horcrux}
            onChange={setHorcrux}
            label="Horcrux Mode"
            description="Split 2-of-3 across PNG, WAV and a ring-bound token (up to 64 KB)"
            icon={<Network size={16} />}
          />
          <label className={`${labelCls} gap-1`}>
            <span className="flex items-center gap-2">
              <Flame size={16} aria-hidden="true" /> Self-destruct
            </span>
            <select
              value={ttlId}
              onChange={(e) => setTtlId(e.target.value)}
              className={`${inputCls} h-11 font-sans`}
              aria-label="Self-destruct timer"
            >
              {TTL_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} className="bg-slate-950">
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void onSubmit()}
          className={btnPrimary}
        >
          {horcrux ? 'Seal Horcrux' : 'Encrypt & Embed'}
        </button>

        {state === 'complete' && armedExpiry !== null && (
          <p className="m-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-400">
            Self-destructs {formatExpiry(armedExpiry)}. After that this drop refuses to decrypt.
          </p>
        )}
        <HorcruxShardList />
      </div>
    </HudPanel>
  );
}

export default EncryptPanel;
