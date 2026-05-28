import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useChipmunkVoice } from "@/hooks/useChipmunkVoice";
import { fetchAppSettings } from "@/lib/backend";

const ChipmunkReactor = lazy(() =>
  import("@/components/ChipmunkReactor").then((module) => ({ default: module.ChipmunkReactor })),
);

export function ChipmunkPage() {
  const [active, setActive] = useState(false);
  const [xaiReady, setXaiReady] = useState<boolean | null>(null);
  const [voiceModel, setVoiceModel] = useState("grok-voice-think-fast-1.0");
  const { status, error, transcript, togglePress, cleanup } = useChipmunkVoice(voiceModel);

  useEffect(() => {
    void fetchAppSettings().then((r) => {
      setXaiReady(Boolean(r.settings?.chipmunk?.xai_configured));
      setVoiceModel(r.settings?.chipmunk?.voice_model ?? "grok-voice-think-fast-1.0");
    });
    return () => cleanup();
  }, [cleanup]);

  const onReactorPress = () => {
    if (xaiReady) {
      void togglePress();
      setActive((on) => !on);
      return;
    }
    setActive((on) => !on);
  };

  const hint =
    status === "listening"
      ? "LISTENING — PRESS AGAIN TO SEND"
      : active
        ? "ARMED"
        : xaiReady
          ? "PRESS FOR VOICE"
          : "ADD XAI KEY IN SETTINGS";

  return (
    <div className={`chipmunk-page${active ? " chipmunk-page-active" : ""}`}>
      <h1 className="visually-hidden">Chipmunk</h1>
      {!xaiReady ? (
        <p className="chipmunk-config-banner">
          Realtime voice needs an xAI API key (
          <Link to="/settings/chipmunk">Settings → Chipmunk</Link>
          ). Model: Grok Voice Think Fast.
        </p>
      ) : null}
      <button
        type="button"
        className="chipmunk-reactor-surface"
        aria-label={active ? "Send voice turn" : "Arm Chipmunk voice"}
        aria-pressed={active}
        onClick={onReactorPress}
      >
        <Suspense fallback={<div className="reactor-3d reactor-3d-loading" />}>
          <ChipmunkReactor intensity={active || status === "listening" ? "active" : "idle"} />
        </Suspense>
      </button>
      <p className="chipmunk-hint" aria-live="polite">
        {hint}
      </p>
      {error ? <p className="error chipmunk-voice-error">{error}</p> : null}
      {transcript ? <p className="chipmunk-transcript">{transcript}</p> : null}
    </div>
  );
}
