import { applyD1Migrations, env } from "cloudflare:test";

const { DB, TEST_MIGRATIONS } = env as typeof env & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

await applyD1Migrations(DB, TEST_MIGRATIONS);
