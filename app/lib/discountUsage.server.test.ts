import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGraphql, mockIssuanceUpdate } = vi.hoisted(() => ({
  mockGraphql: vi.fn(),
  mockIssuanceUpdate: vi.fn(),
}));

vi.mock("./logger.server", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../db.server", () => ({
  default: {
    issuance: {
      update: mockIssuanceUpdate,
    },
  },
}));

import {
  backfillCodeUsedAt,
  getDiscountUsedByPromoCodes,
} from "./discountUsage.server";

describe("getDiscountUsedByPromoCodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty map when no promo codes are provided", async () => {
    const result = await getDiscountUsedByPromoCodes(
      { graphql: mockGraphql },
      [],
    );

    expect(result).toEqual({});
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("marks a code as used when asyncUsageCount is greater than zero", async () => {
    mockGraphql.mockResolvedValue({
      json: async () => ({
        data: {
          codeDiscountNodeByCode: {
            id: "gid://shopify/DiscountCodeNode/123",
            codeDiscount: {
              codes: {
                nodes: [{ code: "LEMON-ABC123", asyncUsageCount: 2 }],
              },
            },
          },
        },
      }),
    });

    const result = await getDiscountUsedByPromoCodes(
      { graphql: mockGraphql },
      [
        {
          discountNodeId: "gid://shopify/DiscountCodeNode/123",
          code: "LEMON-ABC123",
        },
      ],
    );

    expect(result).toEqual({
      "gid://shopify/DiscountCodeNode/123": true,
    });
  });

  it("marks a code as unused when asyncUsageCount is zero", async () => {
    mockGraphql.mockResolvedValue({
      json: async () => ({
        data: {
          codeDiscountNodeByCode: {
            id: "gid://shopify/DiscountCodeNode/456",
            codeDiscount: {
              codes: {
                nodes: [{ code: "LEMON-XYZ789", asyncUsageCount: 0 }],
              },
            },
          },
        },
      }),
    });

    const result = await getDiscountUsedByPromoCodes(
      { graphql: mockGraphql },
      [
        {
          discountNodeId: "gid://shopify/DiscountCodeNode/456",
          code: "LEMON-XYZ789",
        },
      ],
    );

    expect(result).toEqual({
      "gid://shopify/DiscountCodeNode/456": false,
    });
  });
});

describe("backfillCodeUsedAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssuanceUpdate.mockResolvedValue({});
  });

  it("persists codeUsedAt when Shopify reports usage", async () => {
    await backfillCodeUsedAt(
      [
        {
          id: "issuance-1",
          codeUsedAt: null,
          promoCode: {
            discountNodeId: "gid://shopify/DiscountCodeNode/123",
            code: "LEMON-ABC123",
          },
        },
      ],
      { "gid://shopify/DiscountCodeNode/123": true },
    );

    expect(mockIssuanceUpdate).toHaveBeenCalledWith({
      where: { id: "issuance-1" },
      data: { codeUsedAt: expect.any(Date) },
    });
  });

  it("skips issuances that are already marked used", async () => {
    await backfillCodeUsedAt(
      [
        {
          id: "issuance-2",
          codeUsedAt: new Date("2026-08-13T12:00:00.000Z"),
          promoCode: {
            discountNodeId: "gid://shopify/DiscountCodeNode/123",
            code: "LEMON-ABC123",
          },
        },
      ],
      { "gid://shopify/DiscountCodeNode/123": true },
    );

    expect(mockIssuanceUpdate).not.toHaveBeenCalled();
  });
});
