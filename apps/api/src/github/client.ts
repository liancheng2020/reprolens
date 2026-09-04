import type { GitHubCheckRun, GitHubComment, GitHubCommit, GitHubIssue, GitHubRepository } from "./types.js";

export class GitHubApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface ClientOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

export class GitHubClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(readonly repository: string, private readonly token = "", options: ClientOptions = {}) {
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error("GitHub repository must use owner/name format");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.apiBaseUrl ?? "https://api.github.com";
  }

  get authenticated(): boolean {
    return Boolean(this.token);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "reprolens",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers
      }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { message?: string };
      throw new GitHubApiError(payload.message ?? `GitHub request failed (${response.status})`, response.status);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  getIssue(issueNumber: number): Promise<GitHubIssue> {
    return this.request(`/repos/${this.repository}/issues/${issueNumber}`);
  }

  getRepository(): Promise<GitHubRepository> {
    return this.request(`/repos/${this.repository}`);
  }

  getCommit(ref: string): Promise<GitHubCommit> {
    return this.request(`/repos/${this.repository}/commits/${encodeURIComponent(ref)}`);
  }

  async getTextFile(path: string, ref?: string): Promise<string | undefined> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    try {
      const file = await this.request<{ content: string; encoding: string }>(`/repos/${this.repository}/contents/${path}${query}`);
      if (file.encoding !== "base64") throw new Error(`Unsupported GitHub content encoding: ${file.encoding}`);
      return Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  listIssueComments(issueNumber: number): Promise<GitHubComment[]> {
    return this.request(`/repos/${this.repository}/issues/${issueNumber}/comments?per_page=100`);
  }

  createIssueComment(issueNumber: number, body: string): Promise<GitHubComment> {
    return this.request(`/repos/${this.repository}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
  }

  updateIssueComment(commentId: number, body: string): Promise<GitHubComment> {
    return this.request(`/repos/${this.repository}/issues/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body })
    });
  }

  createCheckRun(payload: Record<string, unknown>): Promise<GitHubCheckRun> {
    return this.request(`/repos/${this.repository}/check-runs`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateCheckRun(checkRunId: number, payload: Record<string, unknown>): Promise<GitHubCheckRun> {
    return this.request(`/repos/${this.repository}/check-runs/${checkRunId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
}
