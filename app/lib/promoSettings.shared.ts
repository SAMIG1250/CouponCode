export function formatDiscountPercentage(percentage: number): number {
  return Math.round(percentage * 100);
}

export function normalizeShopDomain(shop: string): string {
  return shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export function toShopifyPercentage(storedPercentage: number): number {
  if (storedPercentage > 1) {
    return storedPercentage / 100;
  }

  return storedPercentage;
}
