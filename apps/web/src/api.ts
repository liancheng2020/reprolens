import type { AppConfig, CreateRunInput, ReproRun } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data as T;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),
  runs: () => request<ReproRun[]>("/api/runs"),
  run: (id: string) => request<ReproRun>(`/api/runs/${id}`),
  createRun: (input: CreateRunInput) => request<ReproRun>("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
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
