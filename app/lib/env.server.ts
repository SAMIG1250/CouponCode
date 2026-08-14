import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SHOP_DOMAIN: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  PROMO_DISCOUNT_TITLE: z.string().min(1).default("Lemonvision Promo Code"),
  PROMO_DISCOUNT_PERCENTAGE: z.coerce.number().min(0).max(1).default(0.1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
