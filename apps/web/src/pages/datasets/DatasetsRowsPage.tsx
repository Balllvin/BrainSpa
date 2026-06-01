import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  createDatasetPreferencePair,
  createDatasetRow,
  deleteDatasetRow,
  fetchDatasetRows,
  fetchDatasetScenarios,
  importDatasetTestFeedback,
  patchDatasetRow,
} from "@/lib/backend";
import {
  datasetDisplayLabel,
  datasetGeneratePath,
  datasetKeyFromSlug,
  datasetsHomePath,
} from "@/lib/datasetsRoutes";
import type { DatasetImportFeedbackResult, DatasetRow, TestScenario } from "@/lib/types";

import { DatasetsShell } from "./DatasetsShell";

const DEFAULT_SCENARIOS = ["counsel", "advice", "daily-word", "review"];

export function DatasetsRowsPage() {
  const { datasetSlug = "starter" } = useParams();
  const datasetKey = datasetKeyFromSlug(datasetSlug);
  const label = datasetDisplayLabel(datasetKey);

  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [pairNote, setPairNote] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [showAddPair, setShowAddPair] = useState(false);

  const loadRows = useCallback(async () => {
    const response = await fetchDatasetRows(datasetKey, 0, 200);
    if (!response.ok || !response.page) {
      setError(response.error ?? "Could not load rows.");
      return;
    }
    setRows(response.page.rows);
    setTotal(response.page.total);
    setError(null);
  }, [datasetKey]);

  useEffect(() => {
    void loadRows();
    void fetchDatasetScenarios().then((r) => {
      if (r.scenarios.length) setScenarios(r.scenarios);
    });
  }, [loadRows]);

  const scenarioOptions =
    scenarios.length > 0
      ? scenarios
      : DEFAULT_SCENARIOS.map((key) => ({ key, label: key, mode: "chat", placeholder: "", hint: "" }));

  async function handleImportFeedback() {
    setBusy("import");
    setImportNote(null);
    const response = await importDatasetTestFeedback(datasetKey);
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Import failed.");
      return;
    }
    const payload: DatasetImportFeedbackResult = response.data;
    setImportNote(payload.message);
    await loadRows();
  }

  async function handleDelete(rowId: string) {
    setBusy(rowId);
    const response = await deleteDatasetRow(datasetKey, rowId);
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Delete failed.");
      return;
    }
    await loadRows();
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>, row: DatasetRow) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(`edit-${row.id}`);
    const response = await patchDatasetRow(datasetKey, row.id, {
      user_prompt: String(form.get("user_prompt") || ""),
      assistant_answer: String(form.get("assistant_answer") || ""),
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Save failed.");
      return;
    }
    setEditingId(null);
    await loadRows();
  }

  async function handleAddRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const labels = String(form.get("failure_labels") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy("add-row");
    const response = await createDatasetRow(datasetKey, {
      scenario_key: String(form.get("scenario_key") || "counsel"),
      user_prompt: String(form.get("user_prompt") || ""),
      assistant_answer: String(form.get("assistant_answer") || ""),
      failure_labels: labels,
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Could not add row.");
      return;
    }
    setShowAddRow(false);
    event.currentTarget.reset();
    await loadRows();
  }

  async function handleAddPair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const labels = String(form.get("failure_labels") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy("add-pair");
    const response = await createDatasetPreferencePair(datasetKey, {
      prompt: String(form.get("prompt") || ""),
      chosen: String(form.get("chosen") || ""),
      rejected: String(form.get("rejected") || ""),
      scenario_key: String(form.get("scenario_key") || "counsel"),
      failure_labels: labels,
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error ?? "Could not save pair.");
      return;
    }
    setPairNote(response.data?.message ?? "Saved preference pair.");
    setShowAddPair(false);
    event.currentTarget.reset();
  }

  return (
    <DatasetsShell backTo={datasetsHomePath()} title={label}>
      <div className="datasets-rows-toolbar">
        <p className="datasets-hint">
          {total} row{total === 1 ? "" : "s"}
          {total === 0 ? (
            <>
              {" "}
              — <Link to={datasetGeneratePath(datasetSlug)}>Generate from evidence</Link>
            </>
          ) : null}
        </p>
        <div className="datasets-rows-actions">
          <button className="secondary" type="button" onClick={() => setShowAddRow((v) => !v)}>
            {showAddRow ? "Cancel add row" : "Add row"}
          </button>
          <button className="secondary" type="button" onClick={() => setShowAddPair((v) => !v)}>
            {showAddPair ? "Cancel pair" : "Add preference pair"}
          </button>
          <button
            className="secondary"
            disabled={Boolean(busy)}
            type="button"
            onClick={handleImportFeedback}
          >
            {busy === "import" ? "Importing…" : "Import feedback from Test"}
          </button>
          <Link className="secondary" to={datasetGeneratePath(datasetSlug)}>
            Generate
          </Link>
        </div>
      </div>

      {showAddRow ? (
        <form className="datasets-add-form" onSubmit={handleAddRow}>
          <h2 className="datasets-add-title">Add row</h2>
          <label className="datasets-field">
            <span>Scenario</span>
            <select name="scenario_key" defaultValue="counsel">
              {scenarioOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="datasets-field">
            <span>User</span>
            <textarea name="user_prompt" required rows={3} />
          </label>
          <label className="datasets-field">
            <span>Assistant</span>
            <textarea name="assistant_answer" required rows={3} />
          </label>
          <label className="datasets-field">
            <span>Failure labels (comma-separated)</span>
            <input name="failure_labels" placeholder="generic_advice, weak_grounding" />
          </label>
          <button className="primary" disabled={busy === "add-row"} type="submit">
            {busy === "add-row" ? "Saving…" : "Save row"}
          </button>
        </form>
      ) : null}

      {showAddPair ? (
        <form className="datasets-add-form" onSubmit={handleAddPair}>
          <h2 className="datasets-add-title">Preference pair (bad vs good)</h2>
          <label className="datasets-field">
            <span>Scenario</span>
            <select name="scenario_key" defaultValue="counsel">
              {scenarioOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="datasets-field">
            <span>Prompt</span>
            <textarea name="prompt" required rows={2} />
          </label>
          <label className="datasets-field">
            <span>Rejected (bad model answer)</span>
            <textarea name="rejected" required rows={2} />
          </label>
          <label className="datasets-field">
            <span>Chosen (your correction)</span>
            <textarea name="chosen" required rows={2} />
          </label>
          <label className="datasets-field">
            <span>Failure labels</span>
            <input name="failure_labels" placeholder="test_miss, user_correction" />
          </label>
          <button className="primary" disabled={busy === "add-pair"} type="submit">
            {busy === "add-pair" ? "Saving…" : "Save pair"}
          </button>
        </form>
      ) : null}

      {importNote ? <p className="datasets-import-note">{importNote}</p> : null}
      {pairNote ? <p className="datasets-import-note">{pairNote}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!rows.length && !error ? <p className="datasets-empty">No training rows yet.</p> : null}

      {rows.length ? (
        <div className="datasets-rows-table-wrap">
          <table className="datasets-rows-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>User</th>
                <th>Assistant</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="datasets-rows-scenario">
                    {row.scenario_key || "—"}
                    {row.metadata?.evidence_claim_ids &&
                    Array.isArray(row.metadata.evidence_claim_ids) &&
                    (row.metadata.evidence_claim_ids as string[]).length > 0 ? (
                      <span className="datasets-row-claims" title="Grounded claim ids">
                        {(row.metadata.evidence_claim_ids as string[]).join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td colSpan={editingId === row.id ? 2 : 1}>
                    {editingId === row.id ? (
                      <form className="datasets-row-edit" onSubmit={(event) => handleEdit(event, row)}>
                        <label>
                          <span>User</span>
                          <textarea name="user_prompt" defaultValue={row.user_prompt} rows={3} />
                        </label>
                        <label>
                          <span>Assistant</span>
                          <textarea name="assistant_answer" defaultValue={row.assistant_answer} rows={3} />
                        </label>
                        <div className="datasets-row-edit-actions">
                          <button className="primary" disabled={Boolean(busy)} type="submit">
                            Save
                          </button>
                          <button className="secondary" type="button" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="datasets-row-prompt">{row.user_prompt}</p>
                    )}
                  </td>
                  {editingId === row.id ? null : (
                    <td>
                      <p className="datasets-row-answer">{row.assistant_answer}</p>
                    </td>
                  )}
                  <td className="datasets-rows-actions-cell">
                    {editingId === row.id ? null : (
                      <>
                        <button className="secondary" type="button" onClick={() => setEditingId(row.id)}>
                          Edit
                        </button>
                        <button
                          className="secondary"
                          disabled={busy === row.id}
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {total > 0 ? (
        <p className="datasets-hint">
          After edits or imports, <Link to="/tune/starter/build">rebuild adapter in Tune</Link>.
        </p>
      ) : null}
    </DatasetsShell>
  );
}
