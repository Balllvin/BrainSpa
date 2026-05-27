"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { logout } from "@/lib/auth";
import { revokeAllSessions } from "@/lib/api";
import type { MeResponse, SessionInfo } from "@/lib/types";

export function SettingsClient({
  user,
  sessions,
}: {
  user: MeResponse;
  sessions: SessionInfo[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleRevokeAll() {
    try {
      const result = await revokeAllSessions();
      setError(null);
      setMessage(`Revoked ${result.revoked_count} sessions.`);
      router.refresh();
    } catch (reason) {
      setMessage(null);
      setError(reason instanceof Error ? reason.message : "Could not revoke sessions");
    }
  }

  async function handleLogout() {
    setSigningOut(true);
    setMessage(null);
    try {
      await logout();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out");
      setSigningOut(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel stack compact-panel">
        <div className="page-header account-header">
          <div className="stack tight">
            <p className="eyebrow">Settings</p>
            <h1>Account</h1>
            <p className="lede">Manage your Data Spa profile and sign-in controls.</p>
          </div>
        </div>
        <dl className="stats">
          <div>
            <dt>Name</dt>
            <dd>{user.full_name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
        <div className="inline-actions">
          <button className="secondary" onClick={handleRevokeAll} type="button">
            Revoke all sessions
          </button>
          <button className="primary" disabled={signingOut} onClick={() => void handleLogout()} type="button">
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
      <section className="panel stack">
        <div className="section-header">
          <h2>Sessions</h2>
          <p>{sessions.length} open session{sessions.length === 1 ? "" : "s"}.</p>
        </div>
        <div className="row-group">
          {sessions.map((session) => (
            <div className="list-row" key={session.session_id}>
              <div className="stack tight">
                <strong>{session.is_current ? "Current session" : "Device session"}</strong>
                <p className="muted">{session.user_agent || "Unknown agent"}</p>
              </div>
              <span className="muted">Expires {new Date(session.expires_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
