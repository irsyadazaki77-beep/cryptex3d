import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileUp, Lock } from 'lucide-react';
import { HudPanel } from './HudPanel';
import { useVaultStore } from '../store/vaultStore';
import { validateFileSize, validatePassphrase } from './encryptValidation';
import { btnPrimary, inputCls, labelCls } from './hudStyles';

/** Encrypt & embed panel: file drop zone, passphrase, dispatch to the vault store. */
export function EncryptPanel() {
  const dispatchEncryptEmbed = useVaultStore((s) => s.dispatchEncryptEmbed);
  const state = useVaultStore((s) => s.encryptStatus.state);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [dragging, setDragging] = useState(false);

  const busy = state !== 'idle' && state !== 'complete' && state !== 'error';
  const passphraseError = passphrase.length > 0 ? validatePassphrase(passphrase) : null;
  const canSubmit = file !== null && fileError === null && validatePassphrase(passphrase) === null && !busy;

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
    setPassphrase('');
    await dispatchEncryptEmbed(bytes, secret);
  };

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
        {fileError && (
          <p role="alert" className="text-sm text-rose-400">
            {fileError}
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

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void onSubmit()}
          className={btnPrimary}
        >
          Encrypt &amp; Embed
        </button>
      </div>
    </HudPanel>
  );
}

export default EncryptPanel;
