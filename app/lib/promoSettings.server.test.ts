import { describe, expect, it } from "vitest";
import {
  formatDiscountPercentage,
  toShopifyPercentage,
} from "./promoSettings.shared";

describe("formatDiscountPercentage", () => {
  it("converts decimal percentage to whole number", () => {
    expect(formatDiscountPercentage(0.1)).toBe(10);
    expect(formatDiscountPercentage(0.15)).toBe(15);
    expect(formatDiscountPercentage(0.2)).toBe(20);
  });
});

describe("toShopifyPercentage", () => {
  it("accepts decimal values between 0 and 1", () => {
    expect(toShopifyPercentage(0.2)).toBe(0.2);
  });

  it("converts whole-number percentages to Shopify decimals", () => {
    expect(toShopifyPercentage(20)).toBe(0.2);
  });
});
