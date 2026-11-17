import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, FileAudio, FileImage, FileJson, Play, Square, Undo2 } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import { setCrystalResonance } from '../scene/sceneBridge';
import { useBlobUrl } from './useBlobUrl';
import { formatExpiry } from './ttlOptions';
import { btnSecondary } from './hudStyles';
import type { ShardKind } from '../store/types';

interface RowProps {
  index: 1 | 2 | 3;
  kind: ShardKind;
  title: string;
  medium: string;
  bytes: Uint8Array;
  mime: string;
  fileName: string;
  icon: ReactNode;
  extra?: ReactNode;
}

function ShardRow({ index, kind, title, medium, bytes, mime, fileName, icon, extra }: RowProps) {
  const url = useBlobUrl(bytes, mime);
  const addDecryptShard = useVaultStore((s) => s.addDecryptShard);
  const loaded = useVaultStore((s) => s.decryptShards.some((x) => x.kind === kind));
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-700/60 bg-slate-950/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-cyan-300">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-medium uppercase tracking-widest text-slate-200">
            Shard {index} · {title}
          </p>
          <p className="m-0 text-xs text-slate-200/55">{medium}</p>
        </div>
        <span className="font-mono text-xs text-slate-200/55">{(bytes.length / 1024).toFixed(1)} KB</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {url && (
          <a href={url} download={fileName} className={`${btnSecondary} h-9 min-h-11 no-underline`}>
            <Download size={16} />
            Download
          </a>
        )}
        <button
          type="button"
          className={`${btnSecondary} h-9 min-h-11`}
          disabled={loaded}
          // A copy, so wiping the recovery buffers can never destroy the exported shard.
          onClick={() => addDecryptShard({ kind, name: fileName, bytes: bytes.slice() })}
        >
          <Undo2 size={16} />
          {loaded ? 'Loaded' : 'Use for recovery'}
        </button>
        {extra}
      </div>
    </li>
  );
}

/** Plays the WAV shard through Web Audio while the Ethereal Crystal resonates. */
function PlayButton({ bytes }: { bytes: Uint8Array }) {
  const [playing, setPlaying] = useState(false);
  const handle = useRef<{ stop(): void } | null>(null);

  useEffect(
    () => () => {
      handle.current?.stop();
      setCrystalResonance(false);
    },
    [],
  );

  const toggle = async (): Promise<void> => {
    if (playing) {
      handle.current?.stop();
      return;
    }
    const { playWavBytes } = await import('../core/audio/shardPlayer');
    const h = await playWavBytes(bytes, () => {
      handle.current = null;
      setPlaying(false);
      setCrystalResonance(false);
    });
    if (!h) return; // audio unavailable: stay silent, like the rest of the audio layer
    handle.current = h;
    setPlaying(true);
    setCrystalResonance(true);
  };

  return (
    <button type="button" className={`${btnSecondary} h-9 min-h-11`} onClick={() => void toggle()}>
      {playing ? <Square size={16} /> : <Play size={16} />}
      {playing ? 'Stop' : 'Play'}
    </button>
  );
}

/** The three exportable Horcrux shards from the last encryption. */
export function HorcruxShardList() {
  const shards = useVaultStore((s) => s.horcruxShards);
  if (!shards) return null;
  const id = shards.setId.slice(0, 8);
  return (
    <section aria-label="Horcrux shards" className="flex flex-col gap-2" data-testid="horcrux-shards">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-xs font-medium uppercase tracking-widest text-cyan-300">Horcrux set</h3>
        <span className="font-mono text-xs text-slate-200/55">{id}</span>
      </div>
      <p className="m-0 text-xs text-slate-200/55">
        Any 2 of the 3 shards plus the passphrase and Spatial Key recover the file. One shard alone is random
        noise.
        {shards.expiresAt !== null && ` Self-destructs ${formatExpiry(shards.expiresAt)}.`}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <ShardRow
          index={1}
          kind="png"
          title="Obsidian Monolith"
          medium="Lossless PNG, LSB texture"
          bytes={shards.monolithPng}
          mime="image/png"
          fileName={`cryptex3d-horcrux-${id}-1-monolith.png`}
          icon={<FileImage size={16} />}
        />
        <ShardRow
          index={2}
          kind="wav"
          title="Ethereal Crystal"
          medium="PCM WAV, sample-LSB drone"
          bytes={shards.crystalWav}
          mime="audio/wav"
          fileName={`cryptex3d-horcrux-${id}-2-crystal.wav`}
          icon={<FileAudio size={16} />}
          extra={<PlayButton bytes={shards.crystalWav} />}
        />
        <ShardRow
          index={3}
          kind="token"
          title="Cryptex Ring"
          medium="Encrypted JSON, bound to ring positions"
          bytes={shards.ringToken}
          mime="application/json"
          fileName={`cryptex3d-horcrux-${id}-3-ring-token.json`}
          icon={<FileJson size={16} />}
        />
      </ul>
    </section>
  );
}

export default HorcruxShardList;
