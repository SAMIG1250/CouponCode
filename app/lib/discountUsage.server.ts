import prisma from "../db.server";
import logger from "./logger.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type PromoCodeUsageInput = {
  discountNodeId: string;
  code: string;
};

const USAGE_BY_CODE_QUERY = `#graphql
  query PromoCodeUsage($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          codes(first: 5) {
            nodes {
              code
              asyncUsageCount
            }
          }
        }
      }
    }
  }
`;

function parseUsageFromResponse(
  body: {
    errors?: unknown[];
    data?: {
      codeDiscountNodeByCode?: {
        id?: string;
        codeDiscount?: {
          codes?: { nodes?: Array<{ code?: string; asyncUsageCount?: number }> };
        };
      };
    };
  },
  code: string,
): { discountNodeId: string | null; used: boolean } {
  if (body.errors?.length) {
    logger.warn(
      { errors: body.errors, code, event: "discount_usage_query_failed" },
      "Shopify returned errors while fetching discount usage",
    );
    return { discountNodeId: null, used: false };
  }

  const node = body.data?.codeDiscountNodeByCode;
  if (!node?.id) {
    return { discountNodeId: null, used: false };
  }

  const normalizedCode = code.toUpperCase();
  const redeemCode = node.codeDiscount?.codes?.nodes?.find(
    (entry) => entry.code?.toUpperCase() === normalizedCode,
  );
  const usageCount = redeemCode?.asyncUsageCount ?? 0;

  return { discountNodeId: node.id, used: usageCount > 0 };
}

async function fetchCodeUsed(
  admin: AdminGraphqlClient,
  code: string,
): Promise<{ discountNodeId: string | null; used: boolean }> {
  const response = await admin.graphql(USAGE_BY_CODE_QUERY, {
    variables: { code },
  });
  const body = await response.json();
  return parseUsageFromResponse(body, code);
}

export async function getDiscountUsedByPromoCodes(
  admin: AdminGraphqlClient,
  promoCodes: PromoCodeUsageInput[],
): Promise<Record<string, boolean>> {
  if (promoCodes.length === 0) {
    return {};
  }

  const uniqueByCode = new Map<string, string>();
  for (const { discountNodeId, code } of promoCodes) {
    uniqueByCode.set(code.toUpperCase(), discountNodeId);
  }

  const usedByNodeId: Record<string, boolean> = {};

  await Promise.all(
    [...uniqueByCode.entries()].map(async ([normalizedCode, discountNodeId]) => {
      try {
        const { discountNodeId: resolvedNodeId, used } = await fetchCodeUsed(
          admin,
          normalizedCode,
        );
        usedByNodeId[resolvedNodeId ?? discountNodeId] = used;
      } catch (error) {
        logger.warn(
          {
            code: normalizedCode,
            discountNodeId,
            error: (error as Error).message,
            event: "discount_usage_fetch_failed",
          },
          "could not fetch discount usage for promo code",
        );
        usedByNodeId[discountNodeId] = false;
      }
    }),
  );

  return usedByNodeId;
}

export async function backfillCodeUsedAt(
  issuances: Array<{
    id: string;
    codeUsedAt: Date | null;
    promoCode: { discountNodeId: string; code: string };
  }>,
  usedByNodeId: Record<string, boolean>,
): Promise<void> {
  const toUpdate = issuances.filter(
    (issuance) =>
      !issuance.codeUsedAt &&
      usedByNodeId[issuance.promoCode.discountNodeId],
  );

  if (toUpdate.length === 0) {
    return;
  }

  await Promise.all(
    toUpdate.map((issuance) =>
      prisma.issuance.update({
        where: { id: issuance.id },
        data: { codeUsedAt: new Date() },
      }),
    ),
  );
}
