"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { normalizeNextPath } from "@/lib/auth-routing";
import { login, signup } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      await login(String(formData.get("email") || ""), String(formData.get("password") || ""));
      router.push(normalizeNextPath(searchParams.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel stack auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Email</span>
        <input name="email" placeholder="you@company.com" type="email" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required minLength={8} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="primary" disabled={loading} type="submit">
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      await signup(
        String(formData.get("email") || ""),
        String(formData.get("password") || ""),
        String(formData.get("full_name") || "")
      );
      router.push(normalizeNextPath(searchParams.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel stack auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Full name</span>
        <input name="full_name" placeholder="Avery Chen" required />
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" placeholder="you@company.com" type="email" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required minLength={8} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="primary" disabled={loading} type="submit">
        {loading ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
