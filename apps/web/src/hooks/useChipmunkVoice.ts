import { useCallback, useRef, useState } from "react";

import { fetchChipmunkVoiceSecret } from "@/lib/backend";

type VoiceStatus = "idle" | "arming" | "listening" | "error";

/** Press-to-talk: first press arms mic, second press sends (Jarvis-style). */
export function useChipmunkVoice(voiceModel: string) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const armedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const cleanup = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    armedRef.current = false;
    setStatus("idle");
  }, []);

  const ensureSocket = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const secret = await fetchChipmunkVoiceSecret();
    if (!secret.ok || !secret.token) {
      throw new Error(secret.error ?? "Could not get voice session.");
    }
    const url = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(voiceModel)}`;
    const ws = new WebSocket(url, ["xai-client-secret", secret.token]);
    wsRef.current = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Voice WebSocket failed."));
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { type?: string; delta?: string; transcript?: string };
          if (data.type === "response.output_audio_transcript.delta" && data.delta) {
            setTranscript((prev) => (prev ?? "") + data.delta);
          }
          if (data.type === "response.output_audio_transcript.done" && data.transcript) {
            setTranscript(data.transcript);
          }
        } catch {
          /* ignore non-json */
        }
      };
    });
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          model: voiceModel,
          voice: "eve",
          turn_detection: { type: "none" },
        },
      }),
    );
  }, [voiceModel]);

  const togglePress = useCallback(async () => {
    setError(null);
    if (!armedRef.current) {
      setStatus("arming");
      try {
        await ensureSocket();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = async (ev) => {
          if (!ev.data.size || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const buffer = await ev.data.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
          const b64 = btoa(binary);
          wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
        };
        recorder.start(250);
        armedRef.current = true;
        setStatus("listening");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Microphone unavailable.");
        setStatus("error");
        cleanup();
      }
      return;
    }

    setStatus("arming");
    recorderRef.current?.stop();
    armedRef.current = false;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      wsRef.current.send(JSON.stringify({ type: "response.create" }));
    }
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    setStatus("idle");
  }, [cleanup, ensureSocket]);

  return { status, error, transcript, togglePress, cleanup };
}
