import { createHmac, timingSafeEqual } from "node:crypto";
import type { IssuesLabeledEvent } from "./types.js";

export function verifyWebhookSignature(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function isIssuesLabeledEvent(value: unknown): value is IssuesLabeledEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<IssuesLabeledEvent>;
  return event.action === "labeled"
    && typeof event.issue?.number === "number"
    && typeof event.issue?.html_url === "string"
    && typeof event.label?.name === "string"
    && typeof event.repository?.full_name === "string";
}
