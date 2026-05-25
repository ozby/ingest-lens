import { Hono } from "hono";
import { eq, or } from "drizzle-orm";
import { generateToken, hashPasswordAsync, verifyPassword } from "../auth/crypto";
import { createDb, type Env } from "../db/client";
import { users } from "../db/schema";
import { authenticate, type AuthVariables } from "../middleware/auth";

type AuthUser = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
};

type RegisterBody = {
  username?: string;
  email?: string;
  password?: string;
};

type LoginBody = {
  username?: string;
  email?: string;
  password?: string;
};

function toAuthUser(user: typeof users.$inferSelect): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export const legacyAuthRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

legacyAuthRoutes.post("/register", async (c) => {
  const body = await c.req.json<RegisterBody>();
  const username = body.username?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!username || !email || !password) {
    return c.json({ status: "error", message: "username, email, and password are required" }, 400);
  }

  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)));

  if (existing.length > 0) {
    return c.json({ status: "error", message: "User already exists" }, 409);
  }

  const hashedPassword = await hashPasswordAsync(password);
  const [user] = await db
    .insert(users)
    .values({
      username,
      email,
      password: hashedPassword,
    })
    .returning();

  if (!user) {
    return c.json({ status: "error", message: "Failed to create user" }, 500);
  }

  const token = await generateToken(user.id, user.username, c.env.JWT_SECRET);

  return c.json(
    {
      status: "success",
      data: {
        token,
        user: toAuthUser(user),
      },
    },
    201,
  );
});

legacyAuthRoutes.post("/login", async (c) => {
  const body = await c.req.json<LoginBody>();
  const usernameOrEmail = body.username?.trim() ?? body.email?.trim().toLowerCase();
  const password = body.password;

  if (!usernameOrEmail || !password) {
    return c.json({ status: "error", message: "Invalid credentials" }, 401);
  }

  const db = createDb(c.env);
  const matches = await db
    .select()
    .from(users)
    .where(or(eq(users.username, usernameOrEmail), eq(users.email, usernameOrEmail)));
  const user = matches[0];

  if (!user) {
    return c.json({ status: "error", message: "Invalid credentials" }, 401);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ status: "error", message: "Invalid credentials" }, 401);
  }

  const token = await generateToken(user.id, user.username, c.env.JWT_SECRET);
  return c.json({
    status: "success",
    data: {
      token,
      user: toAuthUser(user),
    },
  });
});

legacyAuthRoutes.get("/me", authenticate, async (c) => {
  const db = createDb(c.env);
  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, c.get("user").userId));
  const user = found[0];

  if (!user) {
    return c.json({ status: "error", message: "User not found" }, 404);
  }

  return c.json({
    status: "success",
    data: {
      user: toAuthUser(user),
    },
  });
});
