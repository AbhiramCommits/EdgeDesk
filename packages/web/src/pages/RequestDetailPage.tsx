import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ALLOWED_STATUS_TRANSITIONS,
  type AgentStep,
  type RequestDetailResponse,
  type RequestStatus,
  type User,
} from "shared";
import { api, ApiClientError } from "../lib/api";
import { actionLabel, formatDateTime, formatMs, summarize, titleCase } from "../lib/format";
import { useAgentStream } from "../lib/useAgentStream";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Spinner } from "../components/ui/Spinner";
import {
  CategoryBadge,
  PriorityBadge,
  StatusBadge,
} from "../components/ui/EntityBadges";
import { BADGE_VARIANTS } from "../components/ui/badgeVariants";
import { useToast } from "../components/ui/Toast";

function StepRow({ step }: { step: AgentStep }) {
  return (
    <li className={`run-step run-step--${step.kind}`} data-testid="agent-step">
      <span className="run-step__seq" aria-hidden="true">
        {step.seq}
      </span>
      <div className="run-step__body">
        <div className="run-step__head">
          <strong data-testid="agent-step-name">
            {step.toolName ?? titleCase(step.kind)}
          </strong>
          <Badge tone={step.kind === "error" ? "danger" : step.kind === "tool" ? "info" : "neutral"}>
            {step.kind}
          </Badge>
          <span className="run-step__ms" data-testid="agent-step-ms">
            {formatMs(step.ms)}
          </span>
        </div>
        <div className="run-step__io">
          <span className="mono">in · {summarize(step.input, 110)}</span>
          <span className="mono">out · {summarize(step.output, 140)}</span>
        </div>
      </div>
    </li>
  );
}

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();

  const [detail, setDetail] = useState<RequestDetailResponse | null>(null);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeDirty, setAssigneeDirty] = useState(false);
  const [nextStatus, setNextStatus] = useState<RequestStatus | "">("");
  const [resolution, setResolution] = useState("");
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const showError = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiClientError) {
        toast.push(`${error.status} ${error.code}: ${error.message}`, "error");
      } else {
        toast.push(fallback, "error");
      }
    },
    [toast],
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await api.getRequest(id);
      setDetail(response);
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setNotFound(true);
      } else {
        showError(error, "Could not load this request.");
      }
    } finally {
      setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api
      .assignableUsers()
      .then((response) => setAssignees(response.users))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (detail && !assigneeDirty) setAssigneeId(detail.request.assigneeId ?? "");
  }, [detail, assigneeDirty]);

  const stream = useAgentStream(detail?.latestRun ? (id ?? null) : null, () => {
    void load();
  });

  const runStep = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(label);
    try {
      await action();
      await load();
    } catch (error) {
      showError(error, "The action could not be completed.");
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = async (): Promise<void> => {
    if (!id) return;
    await runStep("assign", () =>
      api.updateRequest(id, { assigneeId: assigneeId || null }).then(() => {
        setAssigneeDirty(false);
        toast.push("Assignee updated", "success");
      }),
    );
  };

  const handleStatus = async (): Promise<void> => {
    if (!id || !nextStatus) return;
    await runStep("status", () =>
      api.updateRequest(id, { status: nextStatus }).then(() => {
        toast.push("Status updated", "success");
        setNextStatus("");
      }),
    );
  };

  const handleResolve = async (): Promise<void> => {
    if (!id) return;
    if (resolution.trim().length < 5) {
      setResolutionError("Resolution must be at least 5 characters");
      return;
    }
    setResolutionError(null);
    await runStep("resolve", () =>
      api.resolveRequest(id, { resolution: resolution.trim() }).then(() => {
        toast.push("Request resolved", "success");
        setResolution("");
      }),
    );
  };

  if (loading) {
    return (
      <div className="page">
        <div className="detail-loading card">
          <Spinner size="lg" label="Loading request" />
        </div>
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="page page--narrow">
        <Card title="Request not found">
          <p className="muted">This request does not exist or you no longer have access.</p>
          <p>
            <Link to="/">Back to the queue</Link>
          </p>
        </Card>
      </div>
    );
  }

  const request = detail.request;
  const steps = stream.steps.length > 0 ? stream.steps : detail.steps;
  const runDone =
    stream.done ||
    detail.latestRun?.status === "finished" ||
    detail.latestRun?.status === "failed";
  const durationMs = stream.snapshot?.durationMs ?? detail.latestRun?.durationMs ?? null;
  const confidence = detail.latestRun?.confidence ?? null;
  const statusOptions = ALLOWED_STATUS_TRANSITIONS[request.status]
    .filter((status) => status !== "resolved")
    .map((status) => ({ value: status, label: BADGE_VARIANTS.status[status].label }));
  const assigneeOptions = assignees.map((candidate) => ({
    value: candidate.id,
    label: `${candidate.name} · ${BADGE_VARIANTS.role[candidate.role].label}`,
  }));

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Queue</Link>
        <span aria-hidden="true">/</span>
        <span>{request.title}</span>
      </nav>

      <header className="detail-header">
        <div>
          <div className="row">
            <StatusBadge status={request.status} />
            {request.priority ? (
              <PriorityBadge priority={request.priority} />
            ) : (
              <Badge tone="neutral">Untriaged</Badge>
            )}
            <CategoryBadge category={request.category} />
            {request.slaBreached ? <Badge tone="danger">SLA breached</Badge> : null}
          </div>
          <h1 className="page-title" data-testid="request-title">
            {request.title}
          </h1>
          <p className="page-subtitle">
            Filed by {request.requesterName ?? "Unknown"} · {formatDateTime(request.createdAt)}
          </p>
        </div>
        <div className="detail-meta">
          <div>
            <span className="detail-meta__label">Owner</span>
            <span data-testid="request-assignee">{request.assigneeName ?? "Unassigned"}</span>
          </div>
          <div>
            <span className="detail-meta__label">Due</span>
            <span data-testid="request-due">{formatDateTime(request.dueAt)}</span>
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <div className="stack">
          <Card title="Request">
            <p className="request-body" data-testid="request-body-text">
              {request.body}
            </p>
            {request.resolution ? (
              <div className="resolution-box" data-testid="request-resolution">
                <h3>Resolution</h3>
                <p>{request.resolution}</p>
                <span className="muted">Resolved {formatDateTime(request.resolvedAt)}</span>
              </div>
            ) : null}
            {!request.resolution && request.draftResolution ? (
              <div className="draft-box" data-testid="request-draft">
                <h3>Agent draft reply</h3>
                <pre>{request.draftResolution}</pre>
              </div>
            ) : null}
          </Card>

          <Card
            title="People-Ops actions"
            actions={
              user?.role === "employee" ? <Badge tone="neutral">Employee</Badge> : null
            }
          >
            {user?.role === "employee" ? (
              <p className="notice" data-testid="role-notice">
                You are signed in as an employee. People-Ops mutations are enforced by the API
                and will return a 403.
              </p>
            ) : null}
            <div className="action-grid">
              <div className="action-block">
                <h3>Assign owner</h3>
                <Select
                  label="Assignee"
                  value={assigneeId}
                  onChange={(event) => {
                    setAssigneeId(event.target.value);
                    setAssigneeDirty(true);
                  }}
                  options={assigneeOptions}
                  placeholder="Unassigned"
                  data-testid="assign-select"
                />
                <Button
                  onClick={() => void handleAssign()}
                  loading={busy === "assign"}
                  data-testid="assign-submit"
                >
                  Save assignee
                </Button>
              </div>

              <div className="action-block">
                <h3>Change status</h3>
                <Select
                  label="Next status"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as RequestStatus | "")}
                  options={statusOptions}
                  placeholder="Choose a transition"
                  data-testid="status-select"
                />
                <Button
                  variant="secondary"
                  onClick={() => void handleStatus()}
                  loading={busy === "status"}
                  disabled={!nextStatus}
                  data-testid="status-submit"
                >
                  Update status
                </Button>
              </div>

              <div className="action-block action-block--wide">
                <h3>Resolve request</h3>
                <Textarea
                  label="Resolution"
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder="What was done? This is written to the audit trail."
                  rows={4}
                  error={resolutionError ?? undefined}
                  data-testid="resolve-textarea"
                />
                <Button
                  variant="danger"
                  onClick={() => void handleResolve()}
                  loading={busy === "resolve"}
                  disabled={request.status === "resolved"}
                  data-testid="resolve-submit"
                >
                  Resolve request
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Audit timeline">
            {detail.audit.length === 0 ? (
              <p className="muted">No audit events yet.</p>
            ) : (
              <ol className="audit-list" data-testid="audit-timeline">
                {detail.audit.map((event) => (
                  <li key={event.id} className="audit-item" data-testid="audit-event">
                    <span className="audit-item__dot" aria-hidden="true" />
                    <div>
                      <div className="audit-item__head">
                        <strong data-testid="audit-action">{actionLabel(event.action)}</strong>
                        <span className="muted">{formatDateTime(event.createdAt)}</span>
                      </div>
                      <p className="audit-item__detail">
                        {event.actor} · {summarize(event.detail, 180)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="stack">
          <Card
            title="Agent run"
            actions={
              <span data-testid="run-status">
                {runDone ? (
                  <Badge tone="success">done</Badge>
                ) : (
                  <Badge tone="warning">live</Badge>
                )}
              </span>
            }
          >
            <div className="run-summary">
              <span className="muted">
                {detail.latestRun
                  ? `Run ${detail.latestRun.id.slice(0, 8)} · ${formatMs(durationMs)}`
                  : "No agent run yet"}
              </span>
              {confidence !== null ? (
                <span className="muted">confidence {(confidence * 100).toFixed(0)}%</span>
              ) : null}
            </div>

            {steps.length === 0 ? (
              <div className="empty-state" data-testid="agent-timeline-empty">
                <p className="empty-state__title">Waiting for the first step</p>
                <p>The agent starts as soon as the request is accepted.</p>
              </div>
            ) : (
              <ol className="run-timeline" data-testid="agent-timeline">
                {steps.map((step) => (
                  <StepRow key={step.id} step={step} />
                ))}
              </ol>
            )}

            <div className="run-footer">
              {runDone ? (
                <p role="status" data-testid="agent-done">
                  Agent run finished in {formatMs(durationMs)}.
                </p>
              ) : (
                <p className="row" role="status">
                  <Spinner /> Triaging request…
                </p>
              )}
              {stream.error ? <p className="field__error">{stream.error}</p> : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
