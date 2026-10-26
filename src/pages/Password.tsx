import { useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== again) return setError(t("The two new passwords are not the same."));
        setState("saving");
        setError(null);
        try {
          await api("/api/password", { method: "POST", body: JSON.stringify({ current, next }) });
          setCurrent("");
          setNext("");
          setAgain("");
          setState("saved");
        } catch (err) {
          setError((err as Error).message);
          setState("idle");
        }
      }}
    >
      <h2>{t("Change password")}</h2>
      <div className="field-row">
        <label className="field">
          <span>{t("Current password")}</span>
          <input name="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("New password")}</span>
          <input name="next" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => { setNext(e.target.value); setState("idle"); }} />
        </label>
        <label className="field">
          <span>{t("New password again")}</span>
          <input name="again" type="password" autoComplete="new-password" required minLength={12} value={again} onChange={(e) => { setAgain(e.target.value); setState("idle"); }} />
        </label>
        <button type="submit" className="btn btn--card" disabled={state === "saving"}>
          {state === "saving" ? t("Saving") : t("Change password")}
        </button>
      </div>
      <p className={error ? "help help--error" : "help"} role={error || state === "saved" ? "status" : undefined}>
        {error ??
          (state === "saved"
            ? t("Password changed. Your other devices are signed out.")
            : t("12 characters or more. Forgot it? In Cloudflare, open this Worker, then Settings → Variables and Secrets, and edit PASSWORD: that password works again."))}
      </p>
    </form>
  );
}
