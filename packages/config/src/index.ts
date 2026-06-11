// Validated environment loader. Fail fast at boot if any required var is missing.
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),          // postgresql:// or file:./dev.db (SQLite)
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Master key (KEK) for application-level PII field encryption. Rotate via PII_KEY_ID.
  PII_MASTER_KEY: z.string().min(32),
  PII_KEY_ID: z.string().default("v1"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 14),
  PORT: z.coerce.number().int().positive().default(4000),

  // ── AI / LLM Assistant (keys come from the secret vault, never the browser) ──
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://ollama:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1:8b"),
  // Governance caps.
  AI_GLOBAL_MONTHLY_TOKEN_CAP: z.coerce.number().int().positive().default(5_000_000),
  AI_DEFAULT_ROLE_MONTHLY_TOKEN_CAP: z.coerce.number().int().positive().default(500_000)
});

import { join } from "path";
import { existsSync } from "fs";

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | undefined;
export function loadEnv(): AppEnv {
  if (!cached) {
    let dir = process.cwd();
    while (true) {
      const envPath = join(dir, ".env");
      if (existsSync(envPath)) {
        try {
          if ('loadEnvFile' in process && typeof (process as any).loadEnvFile === 'function') {
            (process as any).loadEnvFile(envPath);
          }
        } catch (e) {
          // Ignore errors loading env file
        }
        break;
      }
      const parent = join(dir, "..");
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    cached = EnvSchema.parse(process.env);
  }
  return cached;
}
