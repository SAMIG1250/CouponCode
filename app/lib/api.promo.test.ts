import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIssuePromoCode,
  mockSendPromoCodeEmail,
  mockRecordPromoEmailSent,
  mockRecordPromoResend,
  mockIsRateLimited,
  mockGetPromoSettings,
} = vi.hoisted(() => ({
  mockIssuePromoCode: vi.fn(),
  mockSendPromoCodeEmail: vi.fn(),
  mockRecordPromoEmailSent: vi.fn(),
  mockRecordPromoResend: vi.fn(),
  mockIsRateLimited: vi.fn(),
  mockGetPromoSettings: vi.fn(),
}));

vi.mock("./promo.server", () => ({
  issuePromoCode: mockIssuePromoCode,
  recordPromoEmailSent: mockRecordPromoEmailSent,
  recordPromoResend: mockRecordPromoResend,
}));

vi.mock("./mail.server", () => ({
  sendPromoCodeEmail: mockSendPromoCodeEmail,
}));

vi.mock("./rateLimit.server", () => ({
  isRateLimited: mockIsRateLimited,
}));

vi.mock("./promoSettings.server", () => ({
  getPromoSettings: mockGetPromoSettings,
  formatDiscountPercentage: (percentage: number) => Math.round(percentage * 100),
  resolveShopDomain: (shop?: string | null) =>
    shop ?? "lemonvision-promo-app.myshopify.com",
  toShopifyPercentage: (value: number) => (value > 1 ? value / 100 : value),
}));

vi.mock("./env.server", () => ({
  getEnv: () => ({
    SHOP_DOMAIN: "lemonvision-promo-app.myshopify.com",
  }),
}));

vi.mock("./logger.server", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: vi.fn(),
    },
  },
}));

import { action, loader } from "../routes/api.promo";

function promoRequest(body: unknown) {
  return new Request("https://example.com/api/promo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.1",
    },
    body: JSON.stringify(body),
  });
}

function actionArgs(body: unknown) {
  const request = promoRequest(body);
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/api/promo",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsRateLimited.mockReturnValue(false);
  mockGetPromoSettings.mockResolvedValue({
    discountTitle: "Lemonvision Promo Code",
    discountPercentage: 0.2,
  });
});

describe("GET /api/promo settings", () => {
  it("returns discount settings for the storefront", async () => {
    const request = new Request("https://example.com/api/promo");
    const response = await loader({
      request,
      params: {},
      context: {},
    } as any);

    expect(response).toMatchObject({
      data: {
        discountPercentage: 20,
        discountTitle: "Lemonvision Promo Code",
      },
      init: { status: 200 },
    });
    expect(mockGetPromoSettings).toHaveBeenCalledWith(
      "lemonvision-promo-app.myshopify.com",
    );
  });
});

describe("POST /api/promo workflow", () => {
  it("validates, allocates, records email sent, and returns issued status", async () => {
    mockIssuePromoCode.mockResolvedValue({
      code: "LEMON-ABC123",
      outcome: "issued",
    });
    mockSendPromoCodeEmail.mockResolvedValue(undefined);
    mockRecordPromoEmailSent.mockResolvedValue(undefined);

    const response = await action(actionArgs({ email: "customer@example.com" }));

    expect(response).toMatchObject({
      data: { status: "issued", code: "LEMON-ABC123" },
      init: { status: 200 },
    });
    expect(mockIssuePromoCode).toHaveBeenCalledWith(
      "customer@example.com",
      "lemonvision-promo-app.myshopify.com",
    );
    expect(mockSendPromoCodeEmail).toHaveBeenCalledWith(
      "customer@example.com",
      "LEMON-ABC123",
    );
    expect(mockRecordPromoEmailSent).toHaveBeenCalledWith(
      "customer@example.com",
      true,
    );
    expect(mockRecordPromoResend).not.toHaveBeenCalled();
  });

  it("resends existing code and records email sent", async () => {
    mockIssuePromoCode.mockResolvedValue({
      code: "LEMON-EXISTING",
      outcome: "resent",
    });
    mockSendPromoCodeEmail.mockResolvedValue(undefined);
    mockRecordPromoEmailSent.mockResolvedValue(undefined);
    mockRecordPromoResend.mockResolvedValue(undefined);

    const response = await action(actionArgs({ email: "customer@example.com" }));

    expect(response).toMatchObject({
      data: { status: "resent", code: "LEMON-EXISTING" },
      init: { status: 200 },
    });
    expect(mockRecordPromoEmailSent).toHaveBeenCalledWith(
      "customer@example.com",
      true,
    );
    expect(mockRecordPromoResend).toHaveBeenCalledWith("customer@example.com");
  });

  it("records email failure when SMTP fails after allocation", async () => {
    mockIssuePromoCode.mockResolvedValue({
      code: "LEMON-ABC123",
      outcome: "issued",
    });
    mockSendPromoCodeEmail.mockRejectedValue(new Error("SMTP unavailable"));
    mockRecordPromoEmailSent.mockResolvedValue(undefined);

    const response = await action(actionArgs({ email: "customer@example.com" }));

    expect(response).toMatchObject({
      data: { code: "LEMON-ABC123", status: "issued" },
      init: { status: 200 },
    });
    expect(mockRecordPromoEmailSent).toHaveBeenCalledWith(
      "customer@example.com",
      false,
    );
  });

  it("rejects invalid email before allocation", async () => {
    const response = await action(actionArgs({ email: "not-an-email" }));

    expect(response).toMatchObject({
      data: { error: "A valid email address is required." },
      init: { status: 400 },
    });
    expect(mockIssuePromoCode).not.toHaveBeenCalled();
    expect(mockSendPromoCodeEmail).not.toHaveBeenCalled();
  });
});
