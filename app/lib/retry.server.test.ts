import { describe, expect, it, vi } from "vitest";
import { retryOnTransientFailure } from "./retry.server";

describe("retryOnTransientFailure", () => {
  it("retries transient fetch failures and eventually succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("GraphQL Client: fetch failed"))
      .mockResolvedValueOnce("ok");

    await expect(
      retryOnTransientFailure(operation, { retries: 2, baseDelayMs: 1 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new Error("Shopify rejected discount code creation"));

    await expect(
      retryOnTransientFailure(operation, { retries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("Shopify rejected discount code creation");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
