import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGraphql,
  mockAdminSession,
  mockFindUnique,
  mockFindUniqueOrThrow,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => {
  const mockGraphql = vi.fn();
  return {
    mockGraphql,
    mockAdminSession: { admin: { graphql: mockGraphql } },
    mockFindUnique: vi.fn(),
    mockFindUniqueOrThrow: vi.fn(),
    mockUpdate: vi.fn(),
    mockTransaction: vi.fn(),
  };
});

vi.mock("../shopify.server", () => ({
  unauthenticated: { admin: vi.fn(async () => mockAdminSession) },
}));

vi.mock("./env.server", () => ({
  getEnv: () => ({
    SHOP_DOMAIN: "lemonvision-promo-app.myshopify.com",
    PROMO_DISCOUNT_TITLE: "Test Promo",
    PROMO_DISCOUNT_PERCENTAGE: 0.1,
  }),
}));

vi.mock("./logger.server", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./promoSettings.server", () => ({
  getPromoSettings: vi.fn(async () => ({
    discountTitle: "Test Promo",
    discountPercentage: 0.2,
  })),
  resolveShopDomain: vi.fn((shop?: string | null) =>
    shop ?? "lemonvision-promo-app.myshopify.com",
  ),
  toShopifyPercentage: vi.fn((value: number) => (value > 1 ? value / 100 : value)),
}));

vi.mock("../db.server", () => ({
  default: {
    issuance: {
      findUnique: mockFindUnique,
      findUniqueOrThrow: mockFindUniqueOrThrow,
      update: mockUpdate,
    },
    $transaction: mockTransaction,
  },
}));

import { issuePromoCode } from "./promo.server";

function graphqlSuccess(code: string, discountNodeId: string) {
  return {
    json: async () => ({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: {
            id: discountNodeId,
            codeDiscount: { codes: { nodes: [{ code }] } },
          },
          userErrors: [],
        },
      },
    }),
  };
}

function graphqlDeactivateSuccess() {
  return {
    json: async () => ({
      data: {
        discountCodeDeactivate: {
          userErrors: [],
        },
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("issuePromoCode", () => {
  it("creates a Shopify discount code and persists it for a new email", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockGraphql.mockResolvedValue(graphqlSuccess("LEMON-ABC123", "gid://shopify/DiscountCodeNode/1"));
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        promoCode: { create: vi.fn(async () => ({ id: "promo-1" })) },
        issuance: { create: vi.fn(async () => ({ id: "issuance-1" })) },
      }),
    );

    const result = await issuePromoCode("customer@example.com");

    expect(result).toEqual({ code: "LEMON-ABC123", outcome: "issued" });
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql.mock.calls[0]?.[1]?.variables.basicCodeDiscount).toMatchObject({
      customerGets: { value: { percentage: 0.2 } },
      usageLimit: 1,
      appliesOncePerCustomer: true,
      context: { all: "ALL" },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("returns the existing code on a duplicate submission without calling Shopify", async () => {
    mockFindUnique.mockResolvedValue({
      email: "customer@example.com",
      promoCode: { code: "LEMON-EXISTING" },
    });

    const result = await issuePromoCode("customer@example.com");

    expect(result).toEqual({ code: "LEMON-EXISTING", outcome: "resent" });
    expect(mockGraphql).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("defers to the winning issuance when two concurrent requests race for the same email", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockGraphql
      .mockResolvedValueOnce(graphqlSuccess("LEMON-RACE", "gid://shopify/DiscountCodeNode/2"))
      .mockResolvedValueOnce(graphqlDeactivateSuccess());
    mockTransaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.16.3",
      }),
    );
    mockFindUniqueOrThrow.mockResolvedValue({
      email: "customer@example.com",
      promoCode: { code: "LEMON-WINNER" },
    });

    const result = await issuePromoCode("customer@example.com");

    expect(result).toEqual({ code: "LEMON-WINNER", outcome: "resent" });
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("throws when Shopify rejects the discount code creation", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockGraphql.mockResolvedValue({
      json: async () => ({
        data: {
          discountCodeBasicCreate: {
            codeDiscountNode: null,
            userErrors: [{ field: ["code"], code: "TAKEN", message: "Code already exists" }],
          },
        },
      }),
    });

    await expect(issuePromoCode("customer@example.com")).rejects.toThrow(
      /Code already exists/,
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
