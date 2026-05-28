import { Link } from "react-router-dom";

import { SPEC_SECTIONS, loadSpecState } from "@/lib/workspace-spec";

/** Fresh workspace shell — voice lives on Chipmunk; full Draft E in Drafts/workspace */
export function WorkspacePage() {
  const spec = loadSpecState();

  return (
    <section className="panel stack workspace-page">
      <header className="panel-header compact-header">
        <h2>Workspace</h2>
        <Link className="secondary" to="/chipmunk">
          Chipmunk voice
        </Link>
      </header>
      <p className="field-hint">
        Living model spec (local). Press-to-talk voice with xAI Grok Think Fast is on{" "}
        <Link to="/chipmunk">Chipmunk</Link>. Configure API key under{" "}
        <Link to="/settings/chipmunk">Settings → Chipmunk</Link>.
      </p>
      <div className="workspace-spec-readonly">
        {SPEC_SECTIONS.map((section) => (
          <article className="workspace-spec-block" key={section.id}>
            <h3>{section.title}</h3>
            <pre>{spec[section.id] || section.placeholder}</pre>
          </article>
        ))}
      </div>
      <p className="settings-note">
        Previous chat + mock tool patches retired to{" "}
        <code>Drafts/retired/workspace/WorkspacePage.tsx</code> in the drafts repo.
      </p>
    </section>
  );
}
