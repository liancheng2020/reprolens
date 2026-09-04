import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { parseIssueUrl } from "./issue-parser.js";
import { GitHubService } from "./service.js";
import { isIssuesLabeledEvent, verifyWebhookSignature } from "./webhook.js";

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const importSchema = z.object({ issueUrl: z.string().trim().url() });

export function createGitHubRouter(service: GitHubService): Router {
  const router = Router();

  router.get("/status", (_request, response) => {
    response.json({
      configured: service.configured,
      triggerLabel: config.githubTriggerLabel,
      webhookConfigured: Boolean(config.githubWebhookSecret)
    });
  });

  router.post("/issues/import", async (request, response, next) => {
    try {
      const parsed = importSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(422).json({ error: "请输入有效的 GitHub Issue 地址" });
        return;
      }
      const issue = parseIssueUrl(parsed.data.issueUrl);
      const result = await service.importIssue({ ...issue, trigger: "manual" });
      if (service.configured) service.publishWhenFinished(result.run.id);
      response.status(result.created ? 202 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/runs/:id/publish", async (request, response, next) => {
    try {
      response.json(await service.publish(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/webhook", async (request: RawBodyRequest, response, next) => {
    try {
      if (!verifyWebhookSignature(request.rawBody ?? Buffer.alloc(0), request.header("x-hub-signature-256"), config.githubWebhookSecret)) {
        response.status(403).json({ error: "Webhook 签名无效" });
        return;
      }
      if (request.header("x-github-event") !== "issues" || !isIssuesLabeledEvent(request.body)) {
        response.status(202).json({ accepted: false });
        return;
      }
      const result = await service.handleLabeledEvent(request.body);
      if (result.accepted && result.run && service.configured) service.publishWhenFinished(result.run.id);
      response.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
