import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData, useLocation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { z } from "zod";
import logger from "../lib/logger.server";
import { formatEmailError, sendPromoCodeEmail } from "../lib/mail.server";
import {
  getDiscountUsedByPromoCodes,
} from "../lib/discountUsage.server";
import { formatDiscountPercentage } from "../lib/promoSettings.shared";
import { getPromoSettings } from "../lib/promoSettings.server";
import {
  recordPromoEmailSent,
  recordPromoCodeUsed,
  recordPromoResend,
} from "../lib/promo.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const issuances = await prisma.issuance.findMany({
    include: { promoCode: true },
    orderBy: { assignedAt: "desc" },
    take: 50,
  });

  let codeUsedByDiscountNodeId: Record<string, boolean> = {};
  try {
    codeUsedByDiscountNodeId = await getDiscountUsedByPromoCodes(
      admin,
      issuances.map((issuance) => ({
        discountNodeId: issuance.promoCode.discountNodeId,
        code: issuance.promoCode.code,
      })),
    );
    await Promise.all(
      issuances
        .filter(
          (issuance) =>
            !issuance.codeUsedAt &&
            codeUsedByDiscountNodeId[issuance.promoCode.discountNodeId],
        )
        .map((issuance) =>
          recordPromoCodeUsed(
            issuance.promoCode.code,
            undefined,
            session.shop,
          ),
        ),
    );
  } catch (error) {
    logger.warn(
      {
        event: "discount_usage_fetch_failed",
        error: (error as Error).message,
      },
      "could not load discount usage for admin table",
    );
  }

  const settings = await getPromoSettings(session.shop);
  const discountPercentage = formatDiscountPercentage(
    settings.discountPercentage,
  );

  return { issuances, codeUsedByDiscountNodeId, discountPercentage };
};

const resendSchema = z.object({ email: z.string().email() });

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const parsed = resendSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid email" };
  }

  const issuance = await prisma.issuance.findUnique({
    where: { email: parsed.data.email },
    include: { promoCode: true },
  });

  if (!issuance) {
    return { ok: false as const, error: "No promo code found for this email" };
  }

  try {
    await sendPromoCodeEmail(parsed.data.email, issuance.promoCode.code, session.shop);
    await recordPromoEmailSent(parsed.data.email, true);
    await recordPromoResend(parsed.data.email);
    return { ok: true as const };
  } catch (error) {
    await recordPromoEmailSent(parsed.data.email, false);
    logger.error(
      {
        email: parsed.data.email,
        event: "admin_resend_failed",
        error: (error as Error).message,
      },
      "manual resend from admin dashboard failed",
    );
    return {
      ok: false as const,
      error: `Failed to resend code: ${formatEmailError(error)}`,
    };
  }
};

export default function Index() {
  const { issuances, codeUsedByDiscountNodeId, discountPercentage } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  const shopify = useAppBridge();
  const resendFetcher = useFetcher<typeof action>();
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (resendFetcher.state === "idle") {
      setResendingEmail(null);
    }

    if (resendFetcher.data?.ok) {
      shopify.toast.show("Promo code resent");
    } else if (resendFetcher.data?.error) {
      shopify.toast.show(resendFetcher.data.error, { isError: true });
    }
  }, [resendFetcher.data, resendFetcher.state, shopify]);

  return (
    <s-page heading="Promo code issuances" inlineSize="large">
      <s-section
        heading={`Recent issuances (${issuances.length})`}
        padding="base"
      >
        <s-stack direction="block" gap="base">
          <s-paragraph>
            New codes are created at {discountPercentage}% off.{" "}
            <Link to={{ pathname: "/app/settings", search: location.search }}>
              Manage discount settings
            </Link>
          </s-paragraph>
          {issuances.length === 0 ? (
            <s-paragraph>
              No promo codes have been issued yet. Once your form starts
              sending requests to /api/promo, issuances will show up here.
            </s-paragraph>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Email</s-table-header>
                <s-table-header>Code</s-table-header>
                <s-table-header>Discount</s-table-header>
                <s-table-header>Discount ID</s-table-header>
                <s-table-header>Issued</s-table-header>
                <s-table-header>Email sent</s-table-header>
                <s-table-header>Code used</s-table-header>
                <s-table-header>Resends</s-table-header>
                <s-table-header listSlot="secondary">Action</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {issuances.map((issuance) => (
                  <s-table-row key={issuance.id}>
                    <s-table-cell>{issuance.email}</s-table-cell>
                    <s-table-cell>{issuance.promoCode.code}</s-table-cell>
                    <s-table-cell>
                      {issuance.promoCode.discountPercentage != null
                        ? `${formatDiscountPercentage(issuance.promoCode.discountPercentage)}%`
                        : "—"}
                    </s-table-cell>
                    <s-table-cell>
                      {issuance.promoCode.discountNodeId}
                    </s-table-cell>
                    <s-table-cell>
                      {new Date(issuance.assignedAt).toLocaleString()}
                    </s-table-cell>
                    <s-table-cell>
                      {issuance.emailSent
                        ? issuance.emailSentAt
                          ? `Yes (${new Date(issuance.emailSentAt).toLocaleString()})`
                          : "Yes"
                        : "No"}
                    </s-table-cell>
                    <s-table-cell>
                      {issuance.codeUsedAt
                        ? `Yes (${new Date(issuance.codeUsedAt).toLocaleString()})`
                        : codeUsedByDiscountNodeId[
                              issuance.promoCode.discountNodeId
                            ]
                          ? "Yes"
                          : "No"}
                    </s-table-cell>
                    <s-table-cell>{issuance.resendCount}</s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        {...(resendingEmail === issuance.email &&
                        resendFetcher.state !== "idle"
                          ? { loading: true }
                          : {})}
                        onClick={() => {
                          setResendingEmail(issuance.email);
                          resendFetcher.submit(
                            { email: issuance.email },
                            { method: "POST" },
                          );
                        }}
                      >
                        Resend
                      </s-button>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
