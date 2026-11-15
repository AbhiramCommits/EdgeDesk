import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  PRIORITY_RANK,
  REQUEST_CATEGORIES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type ListRequestsResponse,
  type RequestCategory,
  type RequestPriority,
  type RequestStatsResponse,
  type RequestStatus,
  type User,
} from "shared";
import { api, ApiClientError } from "../lib/api";
import { formatDateTime, formatShortDate } from "../lib/format";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Table, TableEmpty } from "../components/ui/Table";
import { CategoryBadge, PriorityBadge, StatusBadge } from "../components/ui/EntityBadges";
import { BADGE_VARIANTS } from "../components/ui/badgeVariants";
import { useToast } from "../components/ui/Toast";

type SortField = "created_at" | "updated_at" | "priority" | "due_at";

interface FilterState {
  status: RequestStatus | "";
  category: RequestCategory | "";
  priority: RequestPriority | "";
  assignee: string;
  q: string;
}

const PAGE_SIZE = 10;

const emptyFilters: FilterState = {
  status: "",
  category: "",
  priority: "",
  assignee: "",
  q: "",
};

function SortHeader({
  label,
  field,
  sort,
  order,
  onSort,
}: {
  label: string;
  field: SortField;
  sort: SortField;
  order: "asc" | "desc";
  onSort: (field: SortField) => void;
}) {
  const active = sort === field;
  return (
    <button type="button" className="table__sort" onClick={() => onSort(field)}>
      {label}
      <span aria-hidden="true">{active ? (order === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function LoadingRows() {
  return (
    <tbody>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index}>
          {Array.from({ length: 7 }, (_, cell) => (
            <td key={cell}>
              <span className="skeleton" style={{ width: cell === 0 ? "80%" : "55%" }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function QueuePage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = (searchParams.get("status") ?? "") as RequestStatus | "";
  const initialCategory = (searchParams.get("category") ?? "") as RequestCategory | "";

  const [filters, setFilters] = useState<FilterState>({
    ...emptyFilters,
    status: REQUEST_STATUSES.includes(initialStatus as RequestStatus) ? initialStatus : "",
    category: REQUEST_CATEGORIES.includes(initialCategory as RequestCategory)
      ? initialCategory
      : "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListRequestsResponse | null>(null);
  const [stats, setStats] = useState<RequestStatsResponse | null>(null);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .stats()
      .then(setStats)
      .catch(() => undefined);
    void api
      .assignableUsers()
      .then((response) => setAssignees(response.users))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listRequests({
        status: filters.status || undefined,
        category: filters.category || undefined,
        priority: filters.priority || undefined,
        assignee: filters.assignee || undefined,
        q: filters.q || undefined,
        sort,
        order,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.push(
          error instanceof ApiClientError ? error.message : "Could not load the request queue.",
          "error",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, sort, order, page, toast]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]): void => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    if (key === "status" || key === "category") {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, String(value));
      else next.delete(key);
      setSearchParams(next, { replace: true });
    }
  };

  const handleSort = (field: SortField): void => {
    if (sort === field) {
      setOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
    setPage(0);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusOptions = REQUEST_STATUSES.map((status) => ({
    value: status,
    label: BADGE_VARIANTS.status[status].label,
  }));
  const categoryOptions = REQUEST_CATEGORIES.map((category) => ({
    value: category,
    label: BADGE_VARIANTS.category[category].label,
  }));
  const priorityOptions = REQUEST_PRIORITIES.map((priority) => ({
    value: priority,
    label: BADGE_VARIANTS.priority[priority].label,
  }));
  const assigneeOptions = assignees.map((user) => ({ value: user.id, label: user.name }));

  return (
    <div className="page">
      <header className="page-header spread">
        <div>
          <p className="page-eyebrow">People-Ops</p>
          <h1 className="page-title">Request queue</h1>
          <p className="page-subtitle">
            Every intake, triaged in the background. SLA-breached rows are flagged in red.
          </p>
        </div>
        <Link to="/new" className="btn btn--primary">
          File a request
        </Link>
      </header>

      <section className="status-grid" aria-label="Requests by status">
        <button
          type="button"
          className={filters.status === "" ? "status-card is-active" : "status-card"}
          onClick={() => updateFilter("status", "")}
          data-testid="status-count-all"
        >
          <span className="status-card__label">All</span>
          <span className="status-card__value">{stats?.total ?? "—"}</span>
        </button>
        {REQUEST_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={filters.status === status ? "status-card is-active" : "status-card"}
            onClick={() => updateFilter("status", status)}
            data-testid={`status-count-${status}`}
          >
            <span className="status-card__label">{BADGE_VARIANTS.status[status].label}</span>
            <span className="status-card__value">{stats?.counts[status] ?? "—"}</span>
          </button>
        ))}
      </section>

      <section className="card queue-card">
        <div className="queue-filters">
          <Select
            label="Status"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value as RequestStatus | "")}
            options={statusOptions}
            placeholder="All statuses"
            data-testid="filter-status"
          />
          <Select
            label="Category"
            value={filters.category}
            onChange={(event) =>
              updateFilter("category", event.target.value as RequestCategory | "")
            }
            options={categoryOptions}
            placeholder="All categories"
            data-testid="filter-category"
          />
          <Select
            label="Priority"
            value={filters.priority}
            onChange={(event) =>
              updateFilter("priority", event.target.value as RequestPriority | "")
            }
            options={priorityOptions}
            placeholder="All priorities"
            data-testid="filter-priority"
          />
          <Select
            label="Assignee"
            value={filters.assignee}
            onChange={(event) => updateFilter("assignee", event.target.value)}
            options={assigneeOptions}
            placeholder="Anyone"
            data-testid="filter-assignee"
          />
          <form
            className="queue-search"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter("q", searchInput.trim());
            }}
          >
            <Input
              label="Search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Title or body"
              data-testid="filter-search"
            />
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        </div>

        {loading ? (
          <Table caption="Loading requests">
            <thead>
              <tr>
                <th>Request</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Due</th>
                <th>Created</th>
              </tr>
            </thead>
            <LoadingRows />
          </Table>
        ) : (
          <Table caption="Requests queue">
            <thead>
              <tr>
                <th>Request</th>
                <th>Category</th>
                <th>
                  <SortHeader
                    label="Priority"
                    field="priority"
                    sort={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
                <th>Status</th>
                <th>Assignee</th>
                <th>
                  <SortHeader
                    label="Due"
                    field="due_at"
                    sort={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Created"
                    field="created_at"
                    sort={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
              </tr>
            </thead>
            {items.length === 0 ? (
              <TableEmpty
                colSpan={7}
                message="No requests match these filters. Clear a filter or file a new request."
              />
            ) : (
              <tbody>
                {items.map((request) => (
                  <tr
                    key={request.id}
                    className={request.slaBreached ? "is-sla-breached" : undefined}
                    data-testid="queue-row"
                  >
                    <td>
                      <Link to={`/requests/${request.id}`} className="queue-title">
                        {request.title}
                      </Link>
                      <div className="queue-subtitle">
                        {request.requesterName ?? "Unknown"}
                        {request.slaBreached ? (
                          <span className="queue-sla" data-testid="sla-breach">
                            SLA breached
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <CategoryBadge category={request.category} />
                    </td>
                    <td>
                      {request.priority ? (
                        <PriorityBadge priority={request.priority} />
                      ) : (
                        <Badge tone="neutral">Untriaged</Badge>
                      )}
                      <span className="visually-hidden">
                        rank {request.priority ? PRIORITY_RANK[request.priority] : ""}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={request.status} />
                    </td>
                    <td>{request.assigneeName ?? <span className="muted">Unassigned</span>}</td>
                    <td title={formatDateTime(request.dueAt)}>
                      {request.dueAt ? formatShortDate(request.dueAt) : "—"}
                    </td>
                    <td title={formatDateTime(request.createdAt)}>
                      {formatShortDate(request.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </Table>
        )}

        <footer className="queue-footer">
          <span className="muted" data-testid="queue-total">
            {total} request{total === 1 ? "" : "s"}
          </span>
          <div className="row">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </Button>
            <span className="muted" data-testid="queue-page">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
