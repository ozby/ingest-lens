import { Hono } from "hono";
import { eq, or } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { users } from "../db/schema";
import { authenticate, generateToken, hashPasswordAsync, verifyPassword } from "../middleware/auth";

type AuthVariables = {
  user: { userId: string; username: string };
};

export const authRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json<{
    username: string;
    email: string;
    password: string;
  }>();

  const { username, email, password } = body;

  if (!username || username.length < 3 || username.length > 50) {
    return c.json(
      {
        status: "error",
        message: "Username must be between 3 and 50 characters",
      },
      400,
    );
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return c.json({ status: "error", message: "Email must be valid" }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ status: "error", message: "Password must be at least 6 characters" }, 400);
  }

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
