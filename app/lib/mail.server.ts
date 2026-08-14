import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "./env.server";
import logger from "./logger.server";
import {
  buildPromoEmailContent,
} from "./promoEmailTemplate.server";
import { getPromoEmailBranding } from "./promoEmailBranding.server";

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const env = getEnv();
    const secure = env.SMTP_PORT === 465;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      requireTLS: !secure,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export function formatEmailError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/^Failed to send promo code email: /, "");
}

export async function sendPromoCodeEmail(
  email: string,
  code: string,
  shop?: string,
): Promise<void> {
  const env = getEnv();
  const branding = await getPromoEmailBranding(shop);
  const content = buildPromoEmailContent(code, branding);

  try {
    await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  } catch (error) {
    logger.error(
      {
        email,
        event: "promo_email_failed",
        reason: (error as Error).message,
      },
      "failed to send promo code email",
    );
    throw new Error(
      `Failed to send promo code email: ${(error as Error).message}`,
    );
  }
}
