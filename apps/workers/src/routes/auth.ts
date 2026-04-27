import { Hono } from "hono";
import { eq, or } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { users } from "../db/schema";
import { generateToken, hashPasswordAsync, verifyPassword } from "../auth/crypto";
import { authenticate, type AuthVariables } from "../middleware/auth";

export const authRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

function validateRegistration(body: {
  username: string;
  email: string;
  password: string;
}): Response | null {
  const { username, email, password } = body;
  if (!username || username.length < 3 || username.length > 50) {
    return Response.json(
      { status: "error", message: "Username must be between 3 and 50 characters" },
      { status: 400 },
    );
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ status: "error", message: "Email must be valid" }, { status: 400 });
  }
  if (!password || password.length < 12) {
    return Response.json(
      { status: "error", message: "Password must be at least 12 characters" },
      { status: 400 },
    );
  }
  if (password.length > 1024) {
    return Response.json(
      { status: "error", message: "Password must be at most 1024 characters" },
      { status: 400 },
    );
  }
  return null;
}

authRoutes.post("/register", async (c) => {
  const body = await c.req.json<{
    username: string;
    email: string;
    password: string;
  }>();

  const validationError = validateRegistration(body);
  if (validationError) return validationError;

  const { username, email, password } = body;

  const db = createDb(c.env);

  const existing = await db
    .select()
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ status: "error", message: "Username or email already exists" }, 400);
  }

  const hashedPassword = await hashPasswordAsync(password);
  const [user] = await db
    .insert(users)
    .values({ username, email, password: hashedPassword })
    .returning({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!user) {
    return c.json({ status: "error", message: "Failed to create user" }, 500);
  }

  const token = await generateToken(user.id, user.username, c.env.JWT_SECRET);

  return c.json({ status: "success", data: { user, token } }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ status: "error", message: "Username and password are required" }, 400);
  }

  const db = createDb(c.env);

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (!user) {
    return c.json({ status: "error", message: "Invalid credentials" }, 401);
  }

  const passwordValid = await verifyPassword(password, user.password);
  if (!passwordValid) {
    return c.json({ status: "error", message: "Invalid credentials" }, 401);
  }

  const token = await generateToken(user.id, user.username, c.env.JWT_SECRET);

  const safeUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return c.json({ status: "success", data: { user: safeUser, token } });
});

// POST /api/auth/logout — records the token jti in KV for best-effort revocation.
// Cloudflare KV is eventually consistent, so this is a cheap revocation rail rather
// than a strict globally-immediate logout guarantee. The entry expires after 3600s
// (matching JWT TTL), so no persistent blocklist cleanup is needed afterward.
authRoutes.post("/logout", authenticate, async (c) => {
  const { jti } = c.get("user");
  if (jti) {
    await c.env.KV.put(`revoked:${jti}`, "1", { expirationTtl: 3600 });
  }
  return c.json({ ok: true });
});

authRoutes.get("/me", authenticate, async (c) => {
  const { userId } = c.get("user");
  const db = createDb(c.env);

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ status: "error", message: "User not found" }, 404);
  }

  return c.json({ status: "success", data: { user } });
});
