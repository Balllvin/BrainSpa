import { buildBackendUrl } from "@/lib/backend-url";

type RecoveryTranscript = {
  id: number;
  project_name: string;
  source_name: string;
  source_type: string;
  char_count: number;
  available_local: boolean;
  path: string | null;
};

type RecoveryInventory = {
  totals: {
    transcript_count: number;
    source_text_count: number;
    unavailable_transcript_count: number;
  };
  transcripts: RecoveryTranscript[];
};

async function loadInventory(): Promise<RecoveryInventory> {
  const response = await fetch(buildBackendUrl("/api/recovery/inventory"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Recovery inventory request failed: ${response.status}`);
  }
  return response.json();
}

export default async function TranscriptsPage() {
  const inventory = await loadInventory();

  return (
    <main className="page-grid">
      <section className="panel stack workspace-panel">
        <div className="page-title-block">
          <h1>Transcripts</h1>
          <p className="muted">
            {inventory.totals.transcript_count} transcript records restored. Dataless rows are explicit placeholders, not fake recovered text.
          </p>
        </div>
        <div className="row-group">
          {inventory.transcripts.map((transcript) => (
            <article className="project-row" key={transcript.id}>
              <div className="project-row-content stack tight">
                <h3>{transcript.source_name}</h3>
                <p>{transcript.project_name}</p>
                {transcript.path ? <code className="artifact-path">{transcript.path}</code> : null}
              </div>
              <dl className="project-stats project-row-meta">
                <div>
                  <dt>Type</dt>
                  <dd>{transcript.source_type}</dd>
                </div>
                <div>
                  <dt>Chars</dt>
                  <dd>{transcript.char_count}</dd>
                </div>
                <div>
                  <dt>Local</dt>
                  <dd>{transcript.available_local ? "Readable" : "Dataless"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
