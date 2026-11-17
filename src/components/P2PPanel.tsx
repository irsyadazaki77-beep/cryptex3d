import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, Radio, Send, Repeat } from 'lucide-react';
import { HudPanel } from './HudPanel';
import {
  badgeSuccess,
  badgeWarning,
  btnPrimary,
  btnSecondary,
  labelCls,
  textareaCls,
} from './hudStyles';
import { useVaultStore } from '../store/vaultStore';
import {
  TIMEOUT_MESSAGE,
  buildP2PStatus,
  progressPercent,
  progressWidthClass,
  type TransportMode,
} from './p2pPanelLogic';
import type { P2PManager } from '../core/p2p/P2PManager';
import type { DataChannelHandler } from '../core/p2p/DataChannelHandler';
import type { BroadcastChannelFallback } from '../core/p2p/BroadcastChannelFallback';
import type { TransferProgressTracker } from '../core/p2p/TransferProgressTracker';

type Role = 'sender' | 'recipient';

interface Core {
  manager: P2PManager | null;
  handler: DataChannelHandler | null;
  fallback: BroadcastChannelFallback;
  tracker: TransferProgressTracker;
  disposers: Array<() => void>;
}

function P2PContent() {
  const stegoCarrier = useVaultStore((s) => s.stegoCarrier);
  const p2pStatus = useVaultStore((s) => s.p2pStatus);

  const [role, setRole] = useState<Role>('sender');
  const [transport, setTransport] = useState<TransportMode>('webrtc');
  const [webrtcAvailable, setWebrtcAvailable] = useState(true);
  const [offerText, setOfferText] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [offerInput, setOfferInput] = useState('');
  const [answerOut, setAnswerOut] = useState('');
  const [channelOpen, setChannelOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ transferred: 0, total: 0 });
  const [busy, setBusy] = useState(false);

  const coreRef = useRef<Core | null>(null);
  const unmountedRef = useRef(false);

  const setStatus = useCallback(
    (
      mode: Parameters<typeof buildP2PStatus>[0],
      conn: Parameters<typeof buildP2PStatus>[1],
      transferred = 0,
      total = 0,
    ) => {
      useVaultStore.getState().setP2PStatus(buildP2PStatus(mode, conn, transferred, total));
    },
    [],
  );

  const onReceived = useCallback(
    (bytes: Uint8Array, mode: 'webrtc' | 'broadcast') => {
      useVaultStore.getState().setStegoCarrier(bytes);
      if (mode === 'broadcast') {
        setStatus('broadcast-received', 'connected', bytes.length, bytes.length);
      } else {
        setStatus('webrtc-connected', 'connected', bytes.length, bytes.length);
      }
    },
    [setStatus],
  );

  const switchToBroadcast = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;
    try {
      core.fallback.activateFallback();
      setTransport('broadcast');
      setTimedOut(false);
      setError(null);
      setStatus('broadcast-listening', 'connected');
    } catch {
      setError('BroadcastChannel is unavailable in this browser.');
    }
  }, [setStatus]);

  /** Tears down the current WebRTC manager/handler and creates fresh ones. */
  const buildWebRTC = useCallback(async (): Promise<P2PManager | null> => {
    const core = coreRef.current;
    if (!core) return null;
    core.handler?.dispose();
    core.manager?.close();
    const [{ P2PManager: Manager }, { DataChannelHandler: Handler }] = await Promise.all([
      import('../core/p2p/P2PManager'),
      import('../core/p2p/DataChannelHandler'),
    ]);
    if (unmountedRef.current || coreRef.current !== core) return null;
    const manager = new Manager();
    const handler = new Handler(manager, core.fallback);
    core.manager = manager;
    core.handler = handler;
    setChannelOpen(false);
    setTimedOut(false);
    core.disposers.push(
      manager.on('open', () => setChannelOpen(true)),
      manager.on('close', () => setChannelOpen(false)),
      manager.on('iceTimeout', () => {
        setTimedOut(true);
        setError(TIMEOUT_MESSAGE);
        setStatus('webrtc-offer-pending', 'failed');
      }),
      manager.on('statechange', (s) => {
        if (s === 'connected') setStatus('webrtc-connected', 'connected');
        else if (s === 'failed') {
          setStatus('webrtc-offer-pending', 'failed');
          switchToBroadcast();
        }
      }),
      manager.on('error', () => setError('Data channel error.')),
      handler.on('progress', (p) => {
        setProgress({ transferred: p.bytesTransferred, total: p.totalBytes });
        setStatus('webrtc-connected', 'transferring', p.bytesTransferred, p.totalBytes);
      }),
      handler.on('complete', (bytes) => onReceived(bytes, 'webrtc')),
      handler.on('sent', () => setStatus('webrtc-connected', 'connected')),
      handler.on('fallback', () => {
        setTransport('broadcast');
        setStatus('broadcast-listening', 'connected');
      }),
      handler.on('error', (e) => setError(e.message)),
    );
    return manager;
  }, [onReceived, setStatus, switchToBroadcast]);

  const startOffer = useCallback(async () => {
    setError(null);
    setOfferText('');
    setQrUrl('');
    setAnswerOut('');
    setStatus('webrtc-offer-pending', 'connecting');
    try {
      const manager = await buildWebRTC();
      if (!manager) return;
      const sdp = await manager.createOffer();
      if (unmountedRef.current) return;
      const { SDPNegotiator } = await import('../core/p2p/SDPNegotiator');
      const negotiator = new SDPNegotiator(sdp);
      setOfferText(negotiator.getOfferText());
      const url = await negotiator.getOfferQRDataURL();
      if (!unmountedRef.current) setQrUrl(url);
    } catch (e) {
      if (!unmountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to create offer.');
        switchToBroadcast();
      }
    }
  }, [buildWebRTC, setStatus, switchToBroadcast]);

  // Mount: load core modules lazily, auto-use BroadcastChannel when WebRTC is unavailable.
  useEffect(() => {
    unmountedRef.current = false;
    let cancelled = false;
    void (async () => {
      const [{ BroadcastChannelFallback: Fallback }, { TransferProgressTracker: Tracker }, p2p] =
        await Promise.all([
          import('../core/p2p/BroadcastChannelFallback'),
          import('../core/p2p/TransferProgressTracker'),
          import('../core/p2p/P2PManager'),
        ]);
      if (cancelled) return;
      const fallback = new Fallback();
      const tracker = new Tracker();
      const core: Core = { manager: null, handler: null, fallback, tracker, disposers: [] };
      core.disposers.push(
        fallback.on('received', (bytes) => onReceived(bytes, 'broadcast')),
        tracker.on('progress', (p) => {
          setProgress({ transferred: p.bytesTransferred, total: p.totalBytes });
        }),
      );
      coreRef.current = core;
      if (!p2p.isWebRTCAvailable()) {
        setWebrtcAvailable(false);
        switchToBroadcast();
        return;
      }
      await startOffer();
    })();
    return () => {
      cancelled = true;
      unmountedRef.current = true;
      const core = coreRef.current;
      coreRef.current = null;
      if (core) {
        core.disposers.splice(0).forEach((d) => d());
        core.handler?.dispose();
        core.manager?.close();
        core.fallback.close();
      }
      useVaultStore.getState().setP2PStatus(buildP2PStatus('idle', 'idle'));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => setError('Copy failed.'));
  };

  const onAcceptAnswer = async () => {
    const manager = coreRef.current?.manager;
    if (!manager) return;
    setBusy(true);
    setError(null);
    try {
      await manager.acceptAnswer(answerInput);
      setStatus('webrtc-offer-pending', 'connecting');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid answer.');
    } finally {
      setBusy(false);
    }
  };

  const onAcceptOffer = async () => {
    setBusy(true);
    setError(null);
    try {
      const manager = await buildWebRTC();
      if (!manager) return;
      const answer = await manager.acceptOffer(offerInput);
      if (!unmountedRef.current) {
        setAnswerOut(answer.replace(/\r\n/g, '\n'));
        setStatus('webrtc-offer-pending', 'connecting');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid offer.');
    } finally {
      setBusy(false);
    }
  };

  const selectRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    setError(null);
    if (!webrtcAvailable || transport === 'broadcast') return;
    if (next === 'sender') void startOffer();
    else {
      const core = coreRef.current;
      core?.handler?.dispose();
      core?.manager?.close();
      if (core) {
        core.handler = null;
        core.manager = null;
      }
      setOfferText('');
      setQrUrl('');
      setChannelOpen(false);
    }
  };

  const onSend = async () => {
    const core = coreRef.current;
    if (!core || !stegoCarrier) return;
    setError(null);
    try {
      if (transport === 'broadcast') {
        core.tracker.start(stegoCarrier.length);
        core.fallback.send(stegoCarrier);
        core.tracker.set(stegoCarrier.length);
        setStatus('broadcast-listening', 'connected', stegoCarrier.length, stegoCarrier.length);
      } else if (core.handler) {
        await core.handler.send(stegoCarrier);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.');
    }
  };

  const canSend = !!stegoCarrier && (transport === 'broadcast' || channelOpen);
  const bcSupported = typeof BroadcastChannel !== 'undefined';
  const bcLabel = !bcSupported
    ? 'BroadcastChannel unavailable'
    : p2pStatus.mode === 'broadcast-received'
      ? 'BroadcastChannel: carrier received'
      : transport === 'broadcast'
        ? 'BroadcastChannel: listening'
        : 'BroadcastChannel: standby';
  const openReceiverTab = () => {
    // noopener: the receiver tab needs no handle on this window; BroadcastChannel is same-origin.
    window.open(window.location.href, '_blank', 'noopener');
  };
  const pct = progressPercent(progress.transferred, progress.total);
  const widthCls = progressWidthClass(progress.transferred, progress.total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={role === 'sender' ? btnPrimary : btnSecondary}
          onClick={() => selectRole('sender')}
          disabled={!webrtcAvailable}
        >
          Sender
        </button>
        <button
          type="button"
          className={role === 'recipient' ? btnPrimary : btnSecondary}
          onClick={() => selectRole('recipient')}
          disabled={!webrtcAvailable}
        >
          Recipient
        </button>
        <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={transport === 'broadcast'}
            disabled={!webrtcAvailable}
            onChange={(e) => {
              if (e.target.checked) switchToBroadcast();
              else {
                coreRef.current?.fallback.close();
                setTransport('webrtc');
                setStatus('idle', 'idle');
                if (role === 'sender') void startOffer();
              }
            }}
          />
          Same-Device Mode
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            role="status"
            className={bcSupported && transport === 'broadcast' ? badgeSuccess : badgeWarning}
          >
            <Radio size={16} />
            {bcLabel}
          </span>
          <button type="button" className={btnSecondary} onClick={openReceiverTab}>
            <ExternalLink size={16} />
            Open Receiver Tab
          </button>
        </div>
        <p className="m-0 text-xs text-slate-200/55">
          Test a transfer alone: open a receiver tab, then enable Same-Device Mode in P2P Drop on
          both tabs. Encrypt in this tab, press Send carrier, and the carrier appears in the
          receiver&apos;s Decrypt tab.
        </p>
      </div>
      {!webrtcAvailable && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-400">
          WebRTC is unavailable. Using same-device BroadcastChannel.
        </p>
      )}

      {transport === 'webrtc' && role === 'sender' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} htmlFor="p2p-offer">
              SDP offer
            </label>
            <textarea
              id="p2p-offer"
              readOnly
              rows={6}
              value={offerText}
              placeholder="Generating offer..."
              className={textareaCls}
            />
            <button
              type="button"
              className={`${btnSecondary} mt-2`}
              disabled={!offerText}
              onClick={() => copy(offerText)}
            >
              <Copy size={16} />
              Copy offer
            </button>
          </div>
          {qrUrl && (
            <img src={qrUrl} alt="SDP offer QR code" className="h-40 w-40 rounded-lg" />
          )}
          <div>
            <label className={labelCls} htmlFor="p2p-answer">
              Recipient SDP answer
            </label>
            <textarea
              id="p2p-answer"
              rows={6}
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              placeholder="Paste answer here"
              className={textareaCls}
            />
            <button
              type="button"
              className={`${btnPrimary} mt-2`}
              disabled={busy || !answerInput.trim() || !offerText}
              onClick={() => void onAcceptAnswer()}
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {transport === 'webrtc' && role === 'recipient' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} htmlFor="p2p-offer-in">
              Sender SDP offer
            </label>
            <textarea
              id="p2p-offer-in"
              rows={6}
              value={offerInput}
              onChange={(e) => setOfferInput(e.target.value)}
              placeholder="Paste offer here"
              className={textareaCls}
            />
            <button
              type="button"
              className={`${btnPrimary} mt-2`}
              disabled={busy || !offerInput.trim()}
              onClick={() => void onAcceptOffer()}
            >
              Create answer
            </button>
          </div>
          {answerOut && (
            <div>
              <label className={labelCls} htmlFor="p2p-answer-out">
                SDP answer
              </label>
              <textarea
                id="p2p-answer-out"
                readOnly
                rows={6}
                value={answerOut}
                className={textareaCls}
              />
              <button
                type="button"
                className={`${btnSecondary} mt-2`}
                onClick={() => copy(answerOut)}
              >
                <Copy size={16} />
                Copy answer
              </button>
            </div>
          )}
        </div>
      )}

      {transport === 'broadcast' && (
        <p className="text-sm text-slate-200/55">
          Listening on same-device channel. Open this app in another tab to transfer.
        </p>
      )}

      {timedOut && transport === 'webrtc' && (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 shadow-[0_0_20px_rgba(239,68,68,0.7)]">
          <p className="flex items-center gap-2 text-sm text-rose-400">
            <AlertTriangle size={16} />
            {TIMEOUT_MESSAGE}
          </p>
          <button type="button" className={btnSecondary} onClick={switchToBroadcast}>
            <Repeat size={16} />
            Switch to Same-Device Mode
          </button>
        </div>
      )}

      {error && !timedOut && (
        <p role="alert" className="flex items-center gap-2 text-sm text-rose-400">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={!canSend}
          onClick={() => void onSend()}
        >
          <Send size={16} />
          Send carrier
        </button>
        {progress.total > 0 && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 w-full overflow-hidden rounded-lg bg-slate-950/60"
          >
            <div className={`h-2 bg-emerald-500 transition-all ${widthCls}`} />
          </div>
        )}
        <p className="font-mono text-xs text-slate-200/55">
          {p2pStatus.mode} / {p2pStatus.connectionState}
          {progress.total > 0 && ` / ${progress.transferred}/${progress.total} B`}
        </p>
      </div>
    </div>
  );
}

export function P2PPanel({ className }: { className?: string }) {
  return (
    <HudPanel title="P2P Transfer" icon={<Radio size={16} />} className={className}>
      <P2PContent />
    </HudPanel>
  );
}

export default P2PPanel;
