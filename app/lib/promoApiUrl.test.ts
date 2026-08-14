import { describe, expect, it } from "vitest";

function resolvePromoApiUrl(endpoint: string): string {
  const url = endpoint.replace(/\/$/, "");
  if (url.indexOf("/apps/") === 0) {
    return url;
  }
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
    return `${url}/api/promo`;
  }
  return url;
}

describe("storefront promo form API URL", () => {
  it("uses app proxy path directly", () => {
    expect(resolvePromoApiUrl("/apps/lemonvision-promo")).toBe(
      "/apps/lemonvision-promo",
    );
  });

  it("appends /api/promo for direct app URLs", () => {
    expect(resolvePromoApiUrl("https://my-app.example.com")).toBe(
      "https://my-app.example.com/api/promo",
    );
  });
});
