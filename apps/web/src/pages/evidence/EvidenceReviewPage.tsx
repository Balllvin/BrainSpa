import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  createEvidenceClaim,
  deleteEvidenceClaim,
  fetchEvidenceClaims,
  patchEvidenceClaim,
  updateEvidenceClaim,
} from "@/lib/backend";
import {
  canonicalSourceSlug,
  evidenceHomePath,
  evidenceSourcePath,
  sourceKeyFromSlug,
} from "@/lib/evidenceRoutes";
import type { EvidenceClaim, EvidenceClaimStatus } from "@/lib/types";

import { EvidenceShell } from "./EvidenceShell";

const FILTERS: EvidenceClaimStatus[] = ["pending", "approved", "weak", "rejected"];

export function EvidenceReviewPage() {
  const { slug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const canonicalSlug = canonicalSourceSlug(slug);
  const sourceKey = sourceKeyFromSlug(canonicalSlug);
  const filter = (searchParams.get("filter") as EvidenceClaimStatus | null) ?? "pending";
  const showAdd = searchParams.get("add") === "1";

  const [claims, setClaims] = useState<EvidenceClaim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [addText, setAddText] = useState("");
  const [addCitation, setAddCitation] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCitation, setEditCitation] = useState("");

  async function load() {
    setError(null);
    const response = await fetchEvidenceClaims({ sourceKey, status: filter });
    if (!response.ok) {
      setError(response.error ?? "Could not load claims.");
      setReady(true);
      return;
    }
    setClaims(response.claims);
    setReady(true);
  }

  useEffect(() => {
    setReady(false);
    void load();
  }, [sourceKey, filter]);

  const title = `Review · ${claims[0]?.source_label ?? "Source"}`;
  const pendingWithCitation = useMemo(
    () => claims.filter((claim) => claim.status === "pending" && claim.citation.trim()).length,
    [claims],
  );

  function setFilter(next: EvidenceClaimStatus) {
    const params = new URLSearchParams(searchParams);
    params.set("filter", next);
    params.delete("add");
    setSearchParams(params);
  }

  async function setStatus(claim: EvidenceClaim, status: EvidenceClaimStatus) {
    setBusyId(claim.id);
    setError(null);
    const response = await patchEvidenceClaim(claim.id, status);
    setBusyId(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Could not update claim.");
      return;
    }
    await load();
  }

  async function onAddClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddBusy(true);
    setError(null);
    const response = await createEvidenceClaim({
      text: addText.trim(),
      citation: addCitation.trim(),
      source_key: sourceKey,
    });
    setAddBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Could not add claim.");
      return;
    }
    setAddText("");
    setAddCitation("");
    const params = new URLSearchParams(searchParams);
    params.set("filter", "pending");
    params.delete("add");
    setSearchParams(params);
    await load();
  }

  function startEdit(claim: EvidenceClaim) {
    setEditingId(claim.id);
    setEditText(claim.text);
    setEditCitation(claim.citation);
  }

  async function saveEdit(claimId: string) {
    setBusyId(claimId);
    const response = await updateEvidenceClaim(claimId, {
      text: editText.trim(),
      citation: editCitation.trim(),
    });
    setBusyId(null);
    if (!response.ok) {
      setError(response.error ?? "Could not save edits.");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function removeClaim(claimId: string) {
    setBusyId(claimId);
    const response = await deleteEvidenceClaim(claimId);
    setBusyId(null);
    if (!response.ok) {
      setError(response.error ?? "Could not delete claim.");
      return;
    }
    await load();
  }

  return (
    <EvidenceShell backTo={evidenceHomePath()} backLabel="Evidence" title={title}>
      <p className="evidence-triage-hint">
        Approve = Datasets may use it. Weak = kept, not used for rows. Reject = excluded. Only cited, specific claims.
      </p>

      <div className="evidence-filter-row">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`evidence-filter-btn${filter === item ? " evidence-filter-btn--active" : ""}`}
            onClick={() => setFilter(item)}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {filter === "pending" ? (
        <div className="evidence-bulk-row">
          <span className="evidence-source-meta">{pendingWithCitation} cited pending</span>
          <Link className="evidence-action" to={evidenceSourcePath(canonicalSlug)}>
            Mine / refresh source
          </Link>
        </div>
      ) : null}

      {showAdd ? (
        <form className="evidence-add-form" onSubmit={(event) => void onAddClaim(event)}>
          <h2 className="evidence-add-title">Add claim</h2>
          <label className="evidence-field">
            <span>Claim</span>
            <textarea
              rows={3}
              value={addText}
              onChange={(event) => setAddText(event.target.value)}
              placeholder="Specific behavior you want the model to show."
              required
            />
          </label>
          <label className="evidence-field">
            <span>Citation</span>
            <input
              value={addCitation}
              onChange={(event) => setAddCitation(event.target.value)}
              placeholder="URL, transcript timestamp, or doc reference"
              required
            />
          </label>
          <button className="evidence-primary" type="submit" disabled={addBusy}>
            {addBusy ? "Saving…" : "Save as pending"}
          </button>
        </form>
      ) : null}

      {error ? <p className="evidence-error">{error}</p> : null}
      {!ready ? <p className="evidence-empty">Loading…</p> : null}
      {ready && !claims.length ? (
        <p className="evidence-empty">
          No {filter} claims. <Link to={evidenceSourcePath(canonicalSlug)}>Mine this source</Link>.
        </p>
      ) : null}

      {ready && claims.length ? (
        <ul className="evidence-claim-list">
          {claims.map((claim) => (
            <li key={claim.id} className={`evidence-claim evidence-claim--${claim.status}`}>
              {editingId === claim.id ? (
                <>
                  <textarea
                    className="evidence-edit-input"
                    rows={3}
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                  <input
                    className="evidence-edit-input"
                    value={editCitation}
                    onChange={(event) => setEditCitation(event.target.value)}
                  />
                  <div className="evidence-claim-actions">
                    <button
                      type="button"
                      className="evidence-claim-btn evidence-claim-btn--approve"
                      disabled={busyId === claim.id}
                      onClick={() => void saveEdit(claim.id)}
                    >
                      Save
                    </button>
                    <button type="button" className="evidence-claim-btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {claim.source_label ? <p className="evidence-claim-source">{claim.source_label}</p> : null}
                  <p className="evidence-claim-text">{claim.text}</p>
                  <p className="evidence-claim-citation">{claim.citation || "No citation"}</p>
                  <div className="evidence-claim-actions">
                    <button
                      type="button"
                      className="evidence-claim-btn evidence-claim-btn--approve"
                      disabled={busyId === claim.id || claim.status === "approved"}
                      onClick={() => void setStatus(claim, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="evidence-claim-btn"
                      disabled={busyId === claim.id || claim.status === "weak"}
                      onClick={() => void setStatus(claim, "weak")}
                    >
                      Weak
                    </button>
                    <button
                      type="button"
                      className="evidence-claim-btn evidence-claim-btn--reject"
                      disabled={busyId === claim.id || claim.status === "rejected"}
                      onClick={() => void setStatus(claim, "rejected")}
                    >
                      Reject
                    </button>
                    {claim.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="evidence-claim-btn"
                          disabled={busyId === claim.id}
                          onClick={() => startEdit(claim)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="evidence-claim-btn evidence-claim-btn--reject"
                          disabled={busyId === claim.id}
                          onClick={() => void removeClaim(claim.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </EvidenceShell>
  );
}
