import type { AppConfig, CreateRunInput, QualityTrendPoint, ReproRun } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.text();
  let data: { error?: string } = {};
  if (body) {
    try {
      data = JSON.parse(body) as { error?: string };
    } catch {
      throw new Error(response.ok ? "服务返回了无法解析的数据" : `服务暂时不可用（${response.status}）`);
    }
  }
  if (!response.ok) throw new Error(data.error ?? `服务暂时不可用（${response.status}）`);
  return data as T;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),
  runs: () => request<ReproRun[]>("/api/runs"),
  qualityTrends: () => request<QualityTrendPoint[]>("/api/quality/trends"),
  run: (id: string) => request<ReproRun>(`/api/runs/${id}`),
  createRun: (input: CreateRunInput) => request<ReproRun>("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }),
  verifyRun: (id: string, url: string) => request<ReproRun>(`/api/runs/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  }),
  importGitHubIssue: (issueUrl: string) => request<{ run: ReproRun; created: boolean }>("/api/github/issues/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueUrl })
  }),
  publishGitHubRun: (id: string) => request<ReproRun>(`/api/github/runs/${id}/publish`, {
    method: "POST"
  }),
  subscribe(id: string, onRun: (run: ReproRun) => void, onDisconnect: () => void) {
    const source = new EventSource(`/api/runs/${id}/events`);
    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as { run: ReproRun };
      onRun(payload.run);
      if (["completed", "failed"].includes(payload.run.status)) source.close();
    };
    source.onerror = () => {
      source.close();
      onDisconnect();
    };
    return () => source.close();
  }
};
