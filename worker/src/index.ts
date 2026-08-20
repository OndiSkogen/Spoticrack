import { Hono } from "hono";
import { cors } from "hono/cors";

export type Env = {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return cors({ origin: allowedOrigins })(c, next);
});

app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", db: "ok" });
});

export default app;
