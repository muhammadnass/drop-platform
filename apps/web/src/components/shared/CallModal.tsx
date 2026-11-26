'use client';

import type { RefObject } from 'react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import type { CallStatus } from '@/hooks/useVoiceCall';

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function CallModal({
  status, peerName, duration, muted, error,
  onAccept, onReject, onEnd, onToggleMute,
  remoteAudioRef,
}: {
  status: CallStatus;
  peerName: string;
  duration: number;
  muted: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  remoteAudioRef: RefObject<HTMLAudioElement>;
}) {
  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[1300] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center text-white p-6">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold mb-6"
        style={{ background: 'linear-gradient(135deg, #E8420A, #ff8a4d)' }}
      >
        {peerName?.[0]?.toUpperCase() ?? '?'}
      </div>
      <p className="text-xl font-bold mb-1">{peerName}</p>
      <p className="text-white/50 text-sm mb-10">
        {status === 'calling' && 'Calling…'}
        {status === 'ringing' && 'Incoming call…'}
        {status === 'connected' && fmtDuration(duration)}
        {status === 'ended' && 'Call ended'}
      </p>

      {error && <p className="text-red-400 text-sm mb-6 text-center max-w-xs">{error}</p>}

      {status === 'ringing' && (
        <div className="flex gap-10">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onReject}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-xs text-white/50">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onAccept}
              className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Phone size={26} />
            </button>
            <span className="text-xs text-white/50">Accept</span>
          </div>
        </div>
      )}

      {status === 'connected' && (
        <div className="flex gap-8">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onToggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-white text-black' : 'bg-white/15'}`}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <span className="text-xs text-white/50">{muted ? 'Unmute' : 'Mute'}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onEnd}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-xs text-white/50">End</span>
          </div>
        </div>
      )}

      {status === 'calling' && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onEnd}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform"
          >
            <PhoneOff size={26} />
          </button>
          <span className="text-xs text-white/50">Cancel</span>
        </div>
      )}
    </div>
  );
}
