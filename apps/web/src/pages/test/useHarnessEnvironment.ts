import { useCallback, useEffect, useState } from "react";

import { fetchBrainSpaOverview, fetchHarnessChat, fetchTestScenarios, sendHarnessChatMessage } from "@/lib/backend";
import { fallbackScenarios, modelDisplayName } from "@/lib/testScenarios";
import type { HarnessChatMessage, TestScenario } from "@/lib/types";

export function useHarnessEnvironment(modelKey: string, scenarioKey: string) {
  const [modelLabel, setModelLabel] = useState(() => modelDisplayName(modelKey));
  const [scenario, setScenario] = useState<TestScenario | null>(null);
  const [messages, setMessages] = useState<HarnessChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [fixingId, setFixingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetchHarnessChat(modelKey, scenarioKey);
    if (!response.ok) {
      setMessages([]);
      setError(response.error ?? "Could not load this chat.");
      return;
    }
    setError(null);
    setMessages(
      (response.thread?.messages ?? []).filter(
        (message) =>
          message.role !== "system" &&
          !(message.role === "user" && message.content === "Generate"),
      ),
    );
  }, [modelKey, scenarioKey]);

  useEffect(() => {
    void fetchBrainSpaOverview().then((response) => {
      const model = response.overview?.models.find((item) => item.key === modelKey);
      setModelLabel(modelDisplayName(modelKey, model?.label));
    });
    void (async () => {
      const response = await fetchTestScenarios(modelKey);
      const list =
        response.ok && response.scenarios.length
          ? response.scenarios
          : fallbackScenarios(modelKey);
      setScenario(list.find((item) => item.key === scenarioKey) ?? null);
    })();
    void load();
    setFixingId(null);
    setDraft("");
    setSavedNote(false);
    setPendingUserText(null);
  }, [load, modelKey, scenarioKey]);

  const resolved =
    scenario ?? fallbackScenarios(modelKey).find((item) => item.key === scenarioKey) ?? null;

  const scenarioTitle = resolved?.label
    ? resolved.label
        .split(" ")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ")
    : scenarioKey.replace(/-/g, " ");

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  async function send(text: string, replyToId: number | null = fixingId) {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    setDraft("");
    setPendingUserText(trimmed);
    setBusy(true);
    setError(null);
    setSavedNote(false);

    const response = await sendHarnessChatMessage(modelKey, scenarioKey, trimmed, replyToId);
    setBusy(false);
    setPendingUserText(null);

    if (!response.ok || !response.data) {
      setError(response.error ?? "Request failed.");
      setDraft(trimmed);
      return false;
    }
    if (response.data.generation_state === "blocked") {
      setError(
        response.data.missing_requirements.join(", ") || "Model not ready. Build adapter in Tune.",
      );
      setDraft(trimmed);
      return false;
    }
    if (response.data.kind === "feedback_saved") {
      if (response.data.feedback_recorded) {
        setSavedNote(true);
      } else {
        setError("Could not save correction.");
        setDraft(trimmed);
      }
      setFixingId(null);
      await load();
      return true;
    }
    setFixingId(null);
    await load();
    return true;
  }

  return {
    modelLabel,
    resolved,
    scenarioTitle,
    messages,
    pendingUserText,
    lastAssistant,
    busy,
    awaitingReply: busy && pendingUserText !== null,
    error,
    savedNote,
    fixingId,
    setFixingId,
    draft,
    setDraft,
    setSavedNote,
    setError,
    load,
    send,
  };
}
