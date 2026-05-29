import { testModelPath } from "@/lib/testRoutes";

import { TestNavArrow } from "./TestNav";
import { useHarnessEnvironment } from "./useHarnessEnvironment";

export function TestGenerateEnvironment({
  modelKey,
  scenarioKey,
}: {
  modelKey: string;
  scenarioKey: string;
}) {
  const {
    modelLabel,
    resolved,
    scenarioTitle,
    lastAssistant,
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

  const hasWord = Boolean(lastAssistant);
  const correcting = fixingId !== null;

  async function generate() {
    await send("Generate", null);
  }

  async function submitCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      return;
    }
    await send(text);
  }

  return (
    <div className="test-generate-stage">
      <header className="test-generate-topbar">
        <TestNavArrow to={testModelPath(modelKey)} label={modelLabel} />
        <h1>{scenarioTitle}</h1>
      </header>

      <div className="test-generate-body">
        {!hasWord && !busy ? (
          <p className="test-generate-lead">{resolved?.hint ?? "Tap below for today’s word."}</p>
        ) : null}
        {busy && !hasWord ? <p className="test-generate-lead">Thinking…</p> : null}
        {hasWord && lastAssistant ? (
          <article
            className={`test-generate-card${
              fixingId === lastAssistant.id ? " test-generate-card--fixing" : ""
            }`}
          >
            <p className="test-generate-word">{lastAssistant.content}</p>
            {!correcting ? (
              <button
                className="test-fix-link"
                type="button"
                disabled={busy}
                onClick={() => {
                  setFixingId(lastAssistant.id);
                  setDraft("");
                  setSavedNote(false);
                }}
              >
                Wrong answer?
              </button>
            ) : null}
          </article>
        ) : null}
      </div>

      <footer className="test-generate-footer">
        {correcting ? (
          <form className="test-generate-correction" onSubmit={submitCorrection}>
            <p className="test-chat-compose-hint">What should it have said?</p>
            {savedNote ? (
              <p className="test-chat-compose-hint test-chat-compose-hint--ok">Saved</p>
            ) : null}
            {error ? <p className="test-chat-compose-error">{error}</p> : null}
            <div className="test-chat-compose-row">
              <input
                className="test-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Your correction…"
                disabled={busy}
                autoFocus
              />
              <button
                className="test-chat-submit"
                disabled={busy || !draft.trim()}
                type="submit"
                aria-label="Save correction"
              >
                {busy ? "…" : "↑"}
              </button>
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
            </div>
          </form>
        ) : (
          <>
            {error ? <p className="test-chat-compose-error">{error}</p> : null}
            <button
              className="test-generate-cta"
              type="button"
              disabled={busy}
              onClick={() => void generate()}
            >
              {busy ? "…" : hasWord ? "Another word" : "Get today’s word"}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
