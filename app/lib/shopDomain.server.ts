import { getEnv } from "./env.server";
import { resolveShopDomain } from "./promoSettings.server";

export function resolveShopFromRequest(request: Request): string {
  const url = new URL(request.url);
  return resolveShopDomain(url.searchParams.get("shop"));
}

export function resolveShopFromRequestOrEnv(request: Request): string {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (shop) {
    return resolveShopDomain(shop);
  }

  return resolveShopDomain(getEnv().SHOP_DOMAIN);
}
