import {
  apiErrorSchema,
  type AgentSnapshot,
  type CreateRequestInput,
  type CreateRequestResponse,
  type ListRequestsQuery,
  type ListRequestsResponse,
  type LoginResponse,
  type Request,
  type RequestDetailResponse,
  type RequestStatsResponse,
  type ResolveRequestInput,
  type UpdateRequestInput,
  type User,
  type UsersResponse,
} from "shared";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    let code = `http_${response.status}`;
    let message = `Request failed with status ${response.status}`;
    let details: unknown;
    try {
      const parsed = apiErrorSchema.safeParse(await response.json());
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message;
        details = parsed.data.error.details;
      }
    } catch {
      // Non-JSON error body: keep the HTTP fallback message.
    }
    throw new ApiClientError(response.status, code, message, details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export const api = {
  health: () => jsonRequest<{ ok: boolean; version: string; bindings: string[] }>("/api/health"),

  login: (email: string) =>
    jsonRequest<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  logout: () => jsonRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () => jsonRequest<{ user: User }>("/api/auth/me"),

  listRequests: (params: Partial<ListRequestsQuery> = {}) =>
    jsonRequest<ListRequestsResponse>(
      `/api/requests${queryString({
        status: params.status,
        category: params.category,
        priority: params.priority,
        assignee: params.assignee,
        q: params.q,
        sort: params.sort,
        order: params.order,
        limit: params.limit,
        offset: params.offset,
      })}`,
    ),

  getRequest: (id: string) => jsonRequest<RequestDetailResponse>(`/api/requests/${id}`),

  createRequest: (input: CreateRequestInput) =>
    jsonRequest<CreateRequestResponse>("/api/requests", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateRequest: (id: string, input: UpdateRequestInput) =>
    jsonRequest<{ request: Request }>(`/api/requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  resolveRequest: (id: string, input: ResolveRequestInput) =>
    jsonRequest<{ request: Request }>(`/api/requests/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  stats: () => jsonRequest<RequestStatsResponse>("/api/requests/stats"),

  assignableUsers: () => jsonRequest<UsersResponse>("/api/users/assignable"),

  getRun: (id: string) => jsonRequest<AgentSnapshot>(`/api/requests/${id}/run`),

  streamUrl: (id: string) => `/api/requests/${id}/run/stream`,
};
