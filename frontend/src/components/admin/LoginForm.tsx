import { useState, type FormEvent } from "react";

import { AdminError, signIn } from "../../lib/adminApi";
import { TextInput } from "./fields";

/* Password and the 6-digit code from the authenticator app. Both are always
   asked for, and a failure says only that sign-in failed, never which half was
   wrong: the API answers the same either way and so does this form. */
export default function LoginForm({ onSignedIn, notice }: { onSignedIn: () => void; notice?: string | null }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(password, code.replace(/\s+/g, ""));
      setPassword("");
      setCode("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Could not sign in.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-login card card--static" onSubmit={submit}>
      <h2>Sign in</h2>
      {notice && <p className="adm-notice">{notice}</p>}

      <div className="adm-field">
        <label htmlFor="adm-password">Password</label>
        <input
          id="adm-password"
          type="password"
          autoComplete="current-password"
          value={password}
          maxLength={256}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <TextInput
        label="Code from your authenticator app"
        value={code}
        max={7}
        required
        hint="Six digits. It changes every 30 seconds."
        onChange={setCode}
      />

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={busy || !password || code.replace(/\s/g, "").length < 6}>
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
