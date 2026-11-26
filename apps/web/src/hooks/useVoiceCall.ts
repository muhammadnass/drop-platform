'use client';

// ============================================================
// DROP LOGISTICS — In-app Voice Call (WebRTC)
// Signaling is relayed over the existing Socket.io connection, scoped to
// the `delivery:{id}` room both customer and rider already join. The
// server only forwards these events (socket.gateway.ts) — it never
// inspects the SDP/ICE payloads.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

// Public STUN servers plus a free public TURN relay (Open Relay Project
// test credentials) — needed because the two devices under test (phone +
// tablet, home WiFi + mobile data, etc.) are very likely behind different
// NATs where STUN alone can't establish a direct path.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

interface OfferPayload { deliveryId: string; sdp: RTCSessionDescriptionInit }
interface AnswerPayload { deliveryId: string; sdp: RTCSessionDescriptionInit }
interface IceCandidatePayload { deliveryId: string; candidate: RTCIceCandidateInit }
interface EndPayload { deliveryId: string }

export function useVoiceCall(socket: Socket | null, deliveryId: string | undefined) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  statusRef.current = status;

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    setDuration(0);
    setMuted(false);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate && deliveryId && socket) {
        socket.emit('call:ice-candidate', { deliveryId, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState) && statusRef.current !== 'idle') {
        cleanup();
        setStatus('ended');
        setTimeout(() => setStatus((s) => (s === 'ended' ? 'idle' : s)), 1500);
      }
    };
    pcRef.current = pc;
    return pc;
  }, [socket, deliveryId, cleanup]);

  const micError = (err: any) =>
    err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      ? 'Microphone access denied. Allow microphone access in Settings to make calls.'
      : 'Could not access microphone.';

  const startCall = useCallback(async () => {
    if (!socket || !deliveryId) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:offer', { deliveryId, sdp: offer });
      setStatus('calling');
    } catch (err: any) {
      setError(micError(err));
      cleanup();
    }
  }, [socket, deliveryId, createPeerConnection, cleanup]);

  const acceptCall = useCallback(async () => {
    if (!socket || !deliveryId || !pendingOfferRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
      pendingOfferRef.current = null;
      for (const c of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { deliveryId, sdp: answer });
      setStatus('connected');
    } catch (err: any) {
      setError(micError(err));
      cleanup();
      setStatus('idle');
    }
  }, [socket, deliveryId, createPeerConnection, cleanup]);

  const rejectCall = useCallback(() => {
    if (socket && deliveryId) socket.emit('call:reject', { deliveryId });
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setStatus('idle');
  }, [socket, deliveryId]);

  const endCall = useCallback(() => {
    if (socket && deliveryId) socket.emit('call:end', { deliveryId });
    cleanup();
    setStatus('idle');
  }, [socket, deliveryId, cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  // Call duration ticker, only while actually connected.
  useEffect(() => {
    if (status === 'connected') {
      durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } else if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    return () => { if (durationTimerRef.current) clearInterval(durationTimerRef.current); };
  }, [status]);

  useEffect(() => {
    if (!socket) return;

    const onOffer = ({ deliveryId: id, sdp }: OfferPayload) => {
      if (id !== deliveryId) return;
      if (statusRef.current !== 'idle' && statusRef.current !== 'ended') return; // already in a call
      pendingOfferRef.current = sdp;
      setError(null);
      setStatus('ringing');
    };

    const onAnswer = async ({ deliveryId: id, sdp }: AnswerPayload) => {
      if (id !== deliveryId) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingCandidatesRef.current = [];
      setStatus('connected');
    };

    const onIceCandidate = async ({ deliveryId: id, candidate }: IceCandidatePayload) => {
      if (id !== deliveryId) return;
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    };

    const onEnd = ({ deliveryId: id }: EndPayload) => {
      if (id !== deliveryId) return;
      cleanup();
      setStatus('ended');
      setTimeout(() => setStatus((s) => (s === 'ended' ? 'idle' : s)), 1500);
    };

    const onReject = ({ deliveryId: id }: EndPayload) => {
      if (id !== deliveryId) return;
      cleanup();
      setError('Call declined');
      setStatus('idle');
    };

    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:end', onEnd);
    socket.on('call:reject', onReject);

    return () => {
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:end', onEnd);
      socket.off('call:reject', onReject);
    };
  }, [socket, deliveryId, cleanup]);

  // Clean up on unmount (e.g. navigating away mid-call).
  useEffect(() => () => cleanup(), [cleanup]);

  return {
    status, muted, error, duration,
    startCall, acceptCall, rejectCall, endCall, toggleMute,
    remoteAudioRef,
  };
}
