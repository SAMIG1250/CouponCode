export type PromoEmailBranding = {
  storeName: string;
  storeUrl: string;
  discountTitle: string;
  discountPercentage: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStoreUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function buildDiscountUrl(storeUrl: string, code: string): string {
  return `${normalizeStoreUrl(storeUrl)}/discount/${encodeURIComponent(code)}`;
}

export type PromoEmailContent = {
  subject: string;
  text: string;
  html: string;
};

export function buildPromoEmailContent(
  code: string,
  branding: PromoEmailBranding,
): PromoEmailContent {
  const safeStoreName = escapeHtml(branding.storeName);
  const safeCode = escapeHtml(code);
  const safeDiscountTitle = escapeHtml(branding.discountTitle);
  const discountUrl = buildDiscountUrl(branding.storeUrl, code);
  const safeDiscountUrl = escapeHtml(discountUrl);
  const safeStoreUrl = escapeHtml(branding.storeUrl);
  const percentage = branding.discountPercentage;

  const subject = `Your ${percentage}% off code from ${branding.storeName}`;

  const text = [
    `${branding.storeName}`,
    "",
    `Your exclusive ${percentage}% off promo code`,
    "",
    `Code: ${code}`,
    "",
    `Apply it automatically: ${discountUrl}`,
    `Visit the store: ${branding.storeUrl}`,
    "",
    "Offer details:",
    "- Valid on all products",
    "- Single use only — cannot be reused after checkout",
    "- Check checkout for full terms and expiry",
    "",
    `Discount: ${branding.discountTitle}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f0e8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid rgba(17,17,17,0.08);border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(17,17,17,0.08);">
            <tr>
              <td style="padding:28px 32px 12px;text-align:center;background:linear-gradient(180deg,#fffdf8 0%,#ffffff 100%);">
                <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(201,162,39,0.12);color:#a88418;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                  Exclusive offer
                </div>
                <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.03em;color:#1f1f1f;">
                  Get <span style="color:#c9a227;">${percentage}% OFF</span>
                </h1>
                <p style="margin:0;font-size:16px;line-height:1.5;color:#666666;">
                  Your promo code from ${safeStoreName}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;text-align:center;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#a88418;">
                  Your promo code
                </p>
                <div style="border:2px dashed rgba(17,17,17,0.18);border-radius:14px;padding:18px 20px;background:#fafafa;">
                  <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.08em;color:#111111;">
                    ${safeCode}
                  </span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;text-align:center;">
                <a href="${safeDiscountUrl}" style="display:inline-block;min-width:220px;padding:15px 24px;border-radius:12px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
                  Copy &amp; use code
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;text-align:center;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#666666;">
                  Tap the button above to apply your code at checkout. Start a fresh checkout if you already completed an order with this code.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf8f0;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;line-height:1.5;color:#1f6b3a;font-weight:500;">
                      Valid on all products · Single use only · ${safeDiscountTitle}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;text-align:center;">
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666666;">
                  Prefer to browse first?
                </p>
                <a href="${safeStoreUrl}" style="color:#a88418;font-size:14px;font-weight:600;text-decoration:none;">
                  Visit ${safeStoreName}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#faf6ef;border-top:1px solid rgba(17,17,17,0.06);text-align:center;">
                <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#888888;">
                  ${safeStoreName}
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#888888;">
                  <a href="${safeStoreUrl}" style="color:#888888;text-decoration:underline;">${safeStoreUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
