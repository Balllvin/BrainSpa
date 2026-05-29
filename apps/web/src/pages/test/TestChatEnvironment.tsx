import { useEffect, useMemo, useRef } from "react";

import { testModelPath } from "@/lib/testRoutes";
import type { HarnessChatMessage } from "@/lib/types";

import { TestChatComposer, TestChatShell } from "./TestChatShell";
import { TestChatTyping } from "./TestChatTyping";
import { useHarnessEnvironment } from "./useHarnessEnvironment";

const OPTIMISTIC_USER_ID = -1;

export function TestChatEnvironment({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const {
    modelLabel,
    resolved,
    scenarioTitle,
    messages,
    pendingUserText,
    awaitingReply,
    busy,
    error,
    savedNote,
    fixingId,
    setFixingId,
    draft,
    setDraft,
    setSavedNote,
    send,
  } = useHarnessEnvironment(modelKey, scenarioKey);

  const displayMessages = useMemo(() => {
    const list: HarnessChatMessage[] = [...messages];
    if (pendingUserText) {
      list.push({
        id: OPTIMISTIC_USER_ID,
        role: "user",
        content: pendingUserText,
      });
    }
    return list;
  }, [messages, pendingUserText]);

  const hasThread = displayMessages.length > 0 || awaitingReply;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, awaitingReply]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) {
      return;
    }
    await send(text);
  }

  return (
    <TestChatShell
      backTo={testModelPath(modelKey)}
      backLabel={modelLabel}
      title={scenarioTitle}
      composer={
        resolved ? (
          <TestChatComposer onSubmit={submit}>
            {fixingId ? (
              <p className="test-chat-compose-hint">Correcting — what should it have said?</p>
            ) : null}
            {savedNote ? (
              <p className="test-chat-compose-hint test-chat-compose-hint--ok">Saved</p>
            ) : null}
            {error ? <p className="test-chat-compose-error">{error}</p> : null}
            <div className="test-chat-compose-row">
              <input
                className="test-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={fixingId ? "Your correction…" : resolved.placeholder || "Ask anything"}
                autoFocus
              />
              <button
                className="test-chat-submit"
                disabled={busy || !draft.trim()}
                type="submit"
                aria-label="Send"
              >
                {busy ? "…" : "↑"}
              </button>
              {fixingId ? (
                <button
                  className="test-chat-cancel"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setFixingId(null);
                    setDraft("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </TestChatComposer>
        ) : null
      }
    >
      <div
        className={`test-chat-messages${hasThread ? " test-chat-messages--thread" : ""}`}
        aria-live="polite"
      >
        {!hasThread ? (
          <p className="test-chat-starter">{resolved?.hint ?? "Send a message to start."}</p>
        ) : null}
        {displayMessages.map((message) => {
          const optimistic = message.id === OPTIMISTIC_USER_ID;
          return (
            <article
              key={optimistic ? "optimistic-user" : message.id}
              className={`test-chat-message test-chat-message--${message.role}${
                fixingId === message.id ? " test-chat-message--fixing" : ""
              }${optimistic ? " test-chat-message--pending" : ""}`}
            >
              {message.role === "user" ? (
                <div className="test-chat-bubble-user">{message.content}</div>
              ) : (
                <div className="test-chat-bubble-assistant">
                  <p>{message.content}</p>
                  {!optimistic ? (
                    <button
                      className="test-fix-link"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFixingId(message.id);
                        setDraft("");
                        setSavedNote(false);
                      }}
                    >
                      Wrong answer?
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
        {awaitingReply ? <TestChatTyping /> : null}
        <div ref={endRef} />
      </div>
    </TestChatShell>
  );
}
