import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRequestSchema, REQUEST_CATEGORIES, type RequestCategory } from "shared";
import { api, ApiClientError } from "../lib/api";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import { BADGE_VARIANTS } from "../components/ui/badgeVariants";

interface FieldErrors {
  title?: string;
  body?: string;
  categoryHint?: string;
  form?: string;
}

export function NewRequestPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryHint, setCategoryHint] = useState<RequestCategory | "">("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsed = createRequestSchema.safeParse({
      title,
      body,
      ...(categoryHint ? { categoryHint } : {}),
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "title" || key === "body" || key === "categoryHint") {
          if (!next[key]) next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const created = await api.createRequest(parsed.data);
      toast.push("Request filed — the triage agent is on it.", "success");
      navigate(`/requests/${created.request.id}`, {
        replace: true,
        state: { justCreated: true },
      });
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : "Could not file the request.";
      setErrors({ form: message });
      toast.push(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = REQUEST_CATEGORIES.map((category) => ({
    value: category,
    label: BADGE_VARIANTS.category[category].label,
  }));

  return (
    <div className="page page--narrow">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Intake</p>
          <h1 className="page-title">File a People-Ops request</h1>
          <p className="page-subtitle">
            Describe what you need. The agent classifies it, sets priority and SLA, assigns an
            owner, and drafts a first reply.
          </p>
        </div>
      </header>

      <div className="intake-grid">
        <Card title="Request details">
          <form className="stack" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <Input
              label="Title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Replacement laptop for Monday"
              maxLength={160}
              error={errors.title}
              disabled={submitting}
              data-testid="request-title"
            />

            <Textarea
              label="What do you need?"
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Include the equipment, system, or policy involved, plus any deadline."
              rows={7}
              maxLength={8000}
              error={errors.body}
              hint={`${body.length}/8000 characters`}
              disabled={submitting}
              data-testid="request-body"
            />

            <Select
              label="Category hint (optional)"
              name="categoryHint"
              value={categoryHint}
              onChange={(event) => setCategoryHint(event.target.value as RequestCategory | "")}
              options={categoryOptions}
              placeholder="Let the agent decide"
              hint="A hint only — the deterministic triage engine makes the final call."
              disabled={submitting}
              data-testid="request-category-hint"
            />

            {errors.form ? (
              <p className="field__error" role="alert">
                {errors.form}
              </p>
            ) : null}

            <div className="row">
              <Button type="submit" loading={submitting} data-testid="request-submit">
                File request
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate("/")}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>

        <aside className="intake-aside stack">
          <Card title="What happens next">
            <ol className="steps-list">
              <li>
                <strong>Classify</strong> — weighted keyword rules pick a category and a
                confidence score.
              </li>
              <li>
                <strong>Prioritize</strong> — urgency cues map to p0–p3 and an SLA due date.
              </li>
              <li>
                <strong>Assign</strong> — a People-Ops owner is chosen by category round-robin.
              </li>
              <li>
                <strong>Draft</strong> — the policy knowledge base supplies a first reply.
              </li>
            </ol>
          </Card>
          <Card title="Good requests">
            <ul className="bullet-list">
              <li>Name the exact device, tool, or policy.</li>
              <li>Mention hard deadlines or customer impact.</li>
              <li>Say whether work is currently blocked.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
