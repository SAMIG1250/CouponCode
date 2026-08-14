import prisma from "../db.server";
import { getEnv } from "./env.server";
import {
  formatDiscountPercentage,
  normalizeShopDomain,
  toShopifyPercentage,
} from "./promoSettings.shared";

export type PromoSettings = {
  discountTitle: string;
  discountPercentage: number;
};

export { formatDiscountPercentage, normalizeShopDomain, toShopifyPercentage };

function defaultSettings(): PromoSettings {
  const env = getEnv();
  return {
    discountTitle: env.PROMO_DISCOUNT_TITLE,
    discountPercentage: env.PROMO_DISCOUNT_PERCENTAGE,
  };
}

export function resolveShopDomain(shop?: string | null): string {
  const env = getEnv();
  return normalizeShopDomain(shop ?? env.SHOP_DOMAIN);
}

export async function getPromoSettings(shop: string): Promise<PromoSettings> {
  const normalizedShop = normalizeShopDomain(shop);
  const existing = await prisma.promoSettings.findUnique({
    where: { shop: normalizedShop },
  });

  if (existing) {
    return {
      discountTitle: existing.discountTitle,
      discountPercentage: existing.discountPercentage,
    };
  }

  const defaults = defaultSettings();
  await prisma.promoSettings.create({
    data: {
      shop: normalizedShop,
      discountTitle: defaults.discountTitle,
      discountPercentage: defaults.discountPercentage,
    },
  });

  return defaults;
}

export async function updatePromoSettings(
  shop: string,
  input: { discountTitle: string; discountPercentagePercent: number },
): Promise<PromoSettings> {
  const normalizedShop = normalizeShopDomain(shop);
  const discountPercentage = input.discountPercentagePercent / 100;

  const updated = await prisma.promoSettings.upsert({
    where: { shop: normalizedShop },
    create: {
      shop: normalizedShop,
      discountTitle: input.discountTitle,
      discountPercentage,
    },
    update: {
      discountTitle: input.discountTitle,
      discountPercentage,
    },
  });

  return {
    discountTitle: updated.discountTitle,
    discountPercentage: updated.discountPercentage,
  };
}
