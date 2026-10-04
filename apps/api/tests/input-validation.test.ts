import { expect, it } from "vitest";
import { targetUrlSchema } from "../src/input-validation.js";

it("accepts trimmed authorized-site URL candidates without embedded credentials", () => {
  expect(targetUrlSchema.parse(" http://127.0.0.1:8787/demo ")).toBe("http://127.0.0.1:8787/demo");
  expect(targetUrlSchema.safeParse("https://example.com/test").success).toBe(true);
});

for (const url of ["not-a-url", "", "javascript:alert(1)", "http://user:password@localhost/test", "file:///tmp/private"]) {
  it(`rejects ${JSON.stringify(url)} without throwing from a refinement`, () => {
    expect(() => targetUrlSchema.safeParse(url)).not.toThrow();
    expect(targetUrlSchema.safeParse(url).success).toBe(false);
  });
}
