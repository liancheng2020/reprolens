import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isIssuesLabeledEvent, verifyWebhookSignature } from "../src/github/webhook.js";

describe("GitHub webhook", () => {
  it("validates SHA-256 signatures against the original body", () => {
    const body = Buffer.from('{"action":"labeled"}');
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, signature, "secret")).toBe(true);
    expect(verifyWebhookSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
  });

  it("recognizes only issue labeled events", () => {
    const event = {
      action: "labeled",
      issue: { number: 1, html_url: "https://github.com/a/b/issues/1" },
      label: { name: "needs-reproduction" },
      repository: { full_name: "a/b" }
    };
    expect(isIssuesLabeledEvent(event)).toBe(true);
    expect(isIssuesLabeledEvent({ ...event, action: "opened" })).toBe(false);
  });
});
