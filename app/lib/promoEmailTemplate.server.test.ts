import { describe, expect, it } from "vitest";
import {
  buildDiscountUrl,
  buildPromoEmailContent,
  type PromoEmailBranding,
} from "./promoEmailTemplate.server";

const branding: PromoEmailBranding = {
  storeName: "Lemon Vision",
  storeUrl: "https://lemonvision-promo-app.myshopify.com",
  discountTitle: "Lemonvision Promo Code",
  discountPercentage: 10,
};

describe("buildDiscountUrl", () => {
  it("builds a Shopify discount link", () => {
    expect(
      buildDiscountUrl("https://example.myshopify.com/", "LEMON-ABC123"),
    ).toBe("https://example.myshopify.com/discount/LEMON-ABC123");
  });
});

describe("buildPromoEmailContent", () => {
  it("includes store branding, code, and discount link", () => {
    const content = buildPromoEmailContent("LEMON-ABC123", branding);

    expect(content.subject).toContain("10% off");
    expect(content.subject).toContain("Lemon Vision");
    expect(content.text).toContain("LEMON-ABC123");
    expect(content.text).toContain(
      "https://lemonvision-promo-app.myshopify.com/discount/LEMON-ABC123",
    );
    expect(content.html).toContain("LEMON-ABC123");
    expect(content.html).toContain("Get <span style=\"color:#c9a227;\">10% OFF</span>");
    expect(content.html).toContain("Visit Lemon Vision");
    expect(content.html).toContain("lemonvision-promo-app.myshopify.com");
  });

  it("escapes html in dynamic values", () => {
    const unsafeBranding: PromoEmailBranding = {
      ...branding,
      storeName: 'Test & Co "Premium"',
      discountTitle: "<script>alert(1)</script>",
    };

    const content = buildPromoEmailContent("LEMON-<TAG>", unsafeBranding);

    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("Test &amp; Co &quot;Premium&quot;");
    expect(content.html).toContain("LEMON-&lt;TAG&gt;");
  });
});
