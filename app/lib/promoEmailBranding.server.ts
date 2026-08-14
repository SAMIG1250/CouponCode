import {
  formatDiscountPercentage,
  getPromoSettings,
  resolveShopDomain,
} from "./promoSettings.server";
import type { PromoEmailBranding } from "./promoEmailTemplate.server";
import { unauthenticated } from "../shopify.server";

const SHOP_QUERY = `#graphql
  query PromoEmailShop {
    shop {
      name
      primaryDomain {
        url
      }
    }
  }
`;

function formatShopNameFromDomain(shopDomain: string): string {
  const slug = shopDomain.replace(/\.myshopify\.com$/i, "");
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeStoreUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export async function getPromoEmailBranding(
  shop?: string,
): Promise<PromoEmailBranding> {
  const shopDomain = resolveShopDomain(shop);
  const settings = await getPromoSettings(shopDomain);
  const discountPercentage = formatDiscountPercentage(settings.discountPercentage);

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const response = await admin.graphql(SHOP_QUERY);
    const body = await response.json();
    const shopInfo = body.data?.shop;

    return {
      storeName: shopInfo?.name ?? formatShopNameFromDomain(shopDomain),
      storeUrl: normalizeStoreUrl(
        shopInfo?.primaryDomain?.url ?? `https://${shopDomain}`,
      ),
      discountTitle: settings.discountTitle,
      discountPercentage,
    };
  } catch {
    return {
      storeName: formatShopNameFromDomain(shopDomain),
      storeUrl: normalizeStoreUrl(`https://${shopDomain}`),
      discountTitle: settings.discountTitle,
      discountPercentage,
    };
  }
}
