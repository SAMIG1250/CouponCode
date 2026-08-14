import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import logger from "./logger.server";
import { retryOnTransientFailure } from "./retry.server";
import { getPromoSettings, resolveShopDomain, toShopifyPercentage } from "./promoSettings.server";

const CODE_DISCOUNT_MUTATION = `#graphql
  mutation CreatePromoCode($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

const DEACTIVATE_DISCOUNT_MUTATION = `#graphql
  mutation DeactivatePromoDiscount($id: ID!) {
    discountCodeDeactivate(id: $id) {
      userErrors {
        field
        code
        message
      }
    }
  }
`;

const FIND_CUSTOMER_QUERY = `#graphql
  query FindCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        id
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SetCustomerMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_CUSTOMER_MUTATION = `#graphql
  mutation CreateCustomerWithPromo($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function syncPromoCodeToCustomerMetafield(
  email: string,
  code: string,
  shop?: string,
): Promise<void> {
  try {
    const shopDomain = resolveShopDomain(shop);
    const { admin } = await retryOnTransientFailure(
      () => unauthenticated.admin(shopDomain),
      { label: "unauthenticated.admin" },
    );

    const findResponse = await admin.graphql(FIND_CUSTOMER_QUERY, {
      variables: { query: `email:${email}` },
    });
    const findBody = await findResponse.json();
    const customerId = findBody.data?.customers?.nodes?.[0]?.id;

    if (customerId) {
      await admin.graphql(METAFIELDS_SET_MUTATION, {
        variables: {
          metafields: [
            {
              ownerId: customerId,
              namespace: "custom",
              key: "promo_code",
              value: code,
              type: "single_line_text_field",
            },
          ],
        },
      });
    } else {
      await admin.graphql(CREATE_CUSTOMER_MUTATION, {
        variables: {
          input: {
            email,
            metafields: [
              {
                namespace: "custom",
                key: "promo_code",
                value: code,
                type: "single_line_text_field",
              },
            ],
          },
        },
      });
    }

    logger.info(
      { email, code, event: "customer_metafield_synced" },
      "synced promo code to Shopify customer metafield",
    );
  } catch (error) {
    logger.warn(
      { email, code, error: (error as Error).message, event: "customer_metafield_sync_failed" },
      "failed to sync promo code to customer metafield",
    );
  }
}

export type IssuePromoCodeResult = {
  code: string;
  outcome: "issued" | "resent";
};

function generateCode(): string {
  return `LEMON-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function normalizePromoEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function deactivateShopifyDiscount(
  discountNodeId: string,
  shop?: string,
): Promise<void> {
  const shopDomain = resolveShopDomain(shop);
  const { admin } = await retryOnTransientFailure(
    () => unauthenticated.admin(shopDomain),
    { label: "unauthenticated.admin" },
  );

  const response = await admin.graphql(DEACTIVATE_DISCOUNT_MUTATION, {
    variables: { id: discountNodeId },
  });
  const body = await response.json();
  const userErrors = body.data?.discountCodeDeactivate?.userErrors ?? [];

  if (userErrors.length > 0) {
    logger.warn(
      {
        discountNodeId,
        errors: userErrors,
        event: "promo_discount_deactivate_failed",
      },
      "Shopify rejected promo discount deactivation",
    );
  }
}

async function createShopifyDiscountCode(
  email: string,
  shop?: string,
): Promise<{ code: string; discountNodeId: string; discountPercentage: number }> {
  const shopDomain = resolveShopDomain(shop);
  const settings = await getPromoSettings(shopDomain);
  const discountPercentage = toShopifyPercentage(settings.discountPercentage);
  const { admin } = await retryOnTransientFailure(
    () => unauthenticated.admin(shopDomain),
    { label: "unauthenticated.admin" },
  );
  const code = generateCode();

  logger.info(
    {
      email,
      shop: shopDomain,
      discountPercentage,
      event: "promo_discount_create",
    },
    "creating Shopify discount code from app settings",
  );

  const response = await retryOnTransientFailure(
    () =>
      admin.graphql(CODE_DISCOUNT_MUTATION, {
        variables: {
          basicCodeDiscount: {
            title: `${settings.discountTitle} — ${email}`,
            code,
            startsAt: new Date().toISOString(),
            context: { all: "ALL" },
            customerGets: {
              value: {
                percentage: discountPercentage,
              },
              items: { all: true },
            },
            appliesOncePerCustomer: true,
            usageLimit: 1,
          },
        },
      }),
    { label: "discountCodeBasicCreate" },
  );

  const body = await response.json();
  const result = body.data?.discountCodeBasicCreate;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      `Shopify rejected discount code creation: ${userErrors
        .map((e: { message: string }) => e.message)
        .join("; ")}`,
    );
  }

  const discountNodeId = result?.codeDiscountNode?.id;
  const createdCode =
    result?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;

  if (!discountNodeId || !createdCode) {
    throw new Error("Shopify did not return a discount node for the new code");
  }

  return { code: createdCode, discountNodeId, discountPercentage };
}

// Idempotent: unique constraint on Issuance.email is the allocation guarantee, not app-level
// locking. A race between two concurrent requests for the same email resolves via the DB
// unique-violation catch below, so only one Shopify discount code ever gets created per email.
export async function issuePromoCode(
  email: string,
  shop?: string,
): Promise<IssuePromoCodeResult> {
  const normalizedEmail = normalizePromoEmail(email);

  const existing = await prisma.issuance.findUnique({
    where: { email: normalizedEmail },
    include: { promoCode: true },
  });

  if (existing) {
    logger.info(
      {
        email: normalizedEmail,
        code: existing.promoCode.code,
        event: "promo_resend",
      },
      "resending existing promo code",
    );
    return { code: existing.promoCode.code, outcome: "resent" };
  }

  const { code, discountNodeId, discountPercentage } =
    await createShopifyDiscountCode(normalizedEmail, shop);

  try {
    await prisma.$transaction(async (tx) => {
      const promoCode = await tx.promoCode.create({
        data: { code, discountNodeId, discountPercentage },
      });
      await tx.issuance.create({
        data: { email: normalizedEmail, promoCodeId: promoCode.id },
      });
    });
  } catch (error) {
    await deactivateShopifyDiscount(discountNodeId, shop).catch((deactivateError) => {
      logger.warn(
        {
          email: normalizedEmail,
          discountNodeId,
          error: (deactivateError as Error).message,
          event: "promo_orphan_deactivate_failed",
        },
        "failed to deactivate orphan Shopify discount after DB error",
      );
    });

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Lost the allocation race: another request already claimed this email between
      // our read and write. Fetch what the winner created and resend that instead.
      const winner = await prisma.issuance.findUniqueOrThrow({
        where: { email: normalizedEmail },
        include: { promoCode: true },
      });
      logger.warn(
        { email: normalizedEmail, event: "promo_race_lost" },
        "duplicate allocation race detected, deferring to existing issuance",
      );
      return { code: winner.promoCode.code, outcome: "resent" };
    }
    throw error;
  }

  await syncPromoCodeToCustomerMetafield(normalizedEmail, code, shop);

  logger.info(
    {
      email: normalizedEmail,
      code,
      discountNodeId,
      discountPercentage,
      event: "promo_issued",
    },
    "issued new promo code",
  );
  return { code, outcome: "issued" };
}

export async function recordPromoEmailSent(
  email: string,
  sent: boolean,
): Promise<void> {
  await prisma.issuance.update({
    where: { email },
    data: {
      emailSent: sent,
      emailSentAt: sent ? new Date() : null,
    },
  });
}

export async function recordPromoResend(email: string): Promise<void> {
  await prisma.issuance.update({
    where: { email },
    data: { resentAt: new Date(), resendCount: { increment: 1 } },
  });
}

export async function recordPromoCodeUsed(
  code: string,
  usedAt?: Date,
  shop?: string,
): Promise<void> {
  const promoCode = await prisma.promoCode.findUnique({
    where: { code: code.toUpperCase() },
    include: { issuance: true },
  });

  if (!promoCode?.issuance) {
    return;
  }

  if (!promoCode.issuance.codeUsedAt) {
    await prisma.issuance.update({
      where: { id: promoCode.issuance.id },
      data: { codeUsedAt: usedAt ?? new Date() },
    });

    logger.info(
      { code: promoCode.code, event: "promo_code_used" },
      "promo code marked as used",
    );
  }

  await deactivateShopifyDiscount(promoCode.discountNodeId, shop).catch(
    (error) => {
      logger.warn(
        {
          code: promoCode.code,
          discountNodeId: promoCode.discountNodeId,
          error: (error as Error).message,
          event: "promo_discount_deactivate_failed",
        },
        "failed to deactivate promo discount after order",
      );
    },
  );
}
