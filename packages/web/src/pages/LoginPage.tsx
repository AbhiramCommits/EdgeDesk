import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginRequestSchema } from "shared";
import { useAuth } from "../auth/AuthContext";
import { ApiClientError } from "../lib/api";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

const DEMO_ACCOUNTS = [
  { email: "ada.lovelace@edgedesk.test", label: "Ada · employee" },
  { email: "priya.raman@edgedesk.test", label: "Priya · people_ops" },
  { email: "sasha.ivanov@edgedesk.test", label: "Sasha · admin" },
];

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [email, setEmail] = useState("ada.lovelace@edgedesk.test");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={state?.from ?? "/"} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsed = loginRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid work email");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(parsed.data.email);
      navigate(state?.from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Sign-in failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero" aria-hidden="true">
        <span className="brand__mark brand__mark--large">ED</span>
        <h1>Every People-Ops request, triaged at the edge.</h1>
        <p>
          File equipment, onboarding, policy, access, and payroll requests. A deterministic
          triage agent classifies, prioritizes, assigns, and drafts a reply — with every step
          on the audit trail.
        </p>
        <ul className="login-hero__points">
          <li>D1 for requests, runs, and audit events</li>
          <li>KV for 12-hour sessions</li>
          <li>Durable Objects streaming live agent progress</li>
        </ul>
      </section>

      <section className="login-card card">
        <div className="card__body stack">
          <div>
            <h2 className="login-card__title">Sign in to EdgeDesk</h2>
            <p className="muted">This local demo uses email-only sign-in with seeded accounts.</p>
          </div>

          <form className="stack" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <Input
              label="Work email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error ?? undefined}
              disabled={submitting}
              data-testid="login-email"
            />
            <Button type="submit" loading={submitting} data-testid="login-submit">
              Continue
            </Button>
          </form>

          <div className="login-demo">
            <p className="field__hint">Seeded accounts</p>
            <div className="row">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEmail(account.email);
                    setError(null);
                  }}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
