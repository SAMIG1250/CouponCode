import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { getEnv } from "../lib/env.server";
import logger from "../lib/logger.server";
import { sendPromoCodeEmail } from "../lib/mail.server";
import {
  issuePromoCode,
  recordPromoEmailSent,
  recordPromoResend,
} from "../lib/promo.server";
import {
  formatDiscountPercentage,
  getPromoSettings,
} from "../lib/promoSettings.server";
import { resolveShopFromRequestOrEnv } from "../lib/shopDomain.server";
import { isRateLimited } from "../lib/rateLimit.server";
import { authenticate } from "../shopify.server";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

function isAppProxyRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.searchParams.has("shop") && url.searchParams.has("signature")
  );
}

function responseHeaders(request: Request): HeadersInit {
  if (isAppProxyRequest(request)) {
    return { "Content-Type": "application/json" };
  }

  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": `https://${getEnv().SHOP_DOMAIN}`,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const headers = responseHeaders(request);

  if (isAppProxyRequest(request)) {
    await authenticate.public.appProxy(request);
  }

  const settings = await getPromoSettings(resolveShopFromRequestOrEnv(request));

  return data(
    {
      discountPercentage: formatDiscountPercentage(settings.discountPercentage),
      discountTitle: settings.discountTitle,
    },
    { status: 200, headers },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const headers = responseHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405, headers });
  }

  if (isAppProxyRequest(request)) {
    await authenticate.public.appProxy(request);
  }

  const clientIp = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(clientIp, Date.now())) {
    logger.warn({ clientIp, event: "promo_rate_limited" }, "rate limit exceeded");
    return data(
      { error: "Too many requests, please try again shortly." },
      { status: 429, headers },
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    logger.warn(
      { event: "promo_validation_failed", issues: parsed.error.issues },
      "rejected malformed promo request",
    );
    return data(
      { error: "A valid email address is required." },
      { status: 400, headers },
    );
  }

  const { email } = parsed.data;
  const shop = resolveShopFromRequestOrEnv(request);

  try {
    const { code, outcome } = await issuePromoCode(email, shop);
    try {
      await sendPromoCodeEmail(email, code);
      await recordPromoEmailSent(email, true);
      if (outcome === "resent") {
        await recordPromoResend(email);
      }
    } catch (emailError) {
      await recordPromoEmailSent(email, false);
      throw emailError;
    }
    return data({ status: outcome, code }, { status: 200, headers });
  } catch (error) {
    logger.error(
      { email, event: "promo_issuance_failed", error: (error as Error).message },
      "failed to issue promo code",
    );
    return data(
      { error: "Something went wrong. Please try again later." },
      { status: 500, headers },
    );
  }
}
