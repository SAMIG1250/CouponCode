import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";
import { formatDiscountPercentage } from "../lib/promoSettings.shared";
import {
  getPromoSettings,
  updatePromoSettings,
} from "../lib/promoSettings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getPromoSettings(session.shop);

  return {
    settings,
    discountPercentage: formatDiscountPercentage(settings.discountPercentage),
  };
};

const settingsSchema = z.object({
  discountTitle: z.string().trim().min(1, "Discount title is required"),
  discountPercentage: z.coerce
    .number()
    .min(1, "Minimum discount is 1%")
    .max(100, "Maximum discount is 100%"),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const parsed = settingsSchema.safeParse({
    discountTitle: formData.get("discountTitle"),
    discountPercentage: formData.get("discountPercentage"),
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid settings",
    };
  }

  await updatePromoSettings(session.shop, {
    discountTitle: parsed.data.discountTitle,
    discountPercentagePercent: parsed.data.discountPercentage,
  });

  return { ok: true as const };
};

export default function SettingsPage() {
  const { settings, discountPercentage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [title, setTitle] = useState(settings.discountTitle);
  const [percentage, setPercentage] = useState(String(discountPercentage));
  const isSaving = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("Promo settings saved");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Promo settings">
      <Form method="post">
        <s-section heading="Discount for new promo codes">
          <s-paragraph>
            These settings apply to newly issued promo codes only. Existing
            codes keep the discount they were created with.
          </s-paragraph>
          <s-stack direction="block" gap="base">
            <s-text-field
              name="discountTitle"
              label="Discount title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              autocomplete="off"
              required
            />
            <s-number-field
              name="discountPercentage"
              label="Discount percentage"
              details="Enter a value from 1 to 100"
              value={percentage}
              onChange={(event) => setPercentage(event.currentTarget.value)}
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              required
            />
            <s-button
              type="submit"
              variant="primary"
              {...(isSaving ? { loading: true } : {})}
            >
              Save settings
            </s-button>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
