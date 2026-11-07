import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { settings, users } from "@nocap/db";
import { loginSchema, setupSchema, type PublicUser, type SetupStatus } from "@nocap/shared";
import { audit } from "../audit";
import { fakeVerify, hashPassword, verifyPassword } from "../auth/password";
import { createSession, deleteSession, SESSION_COOKIE } from "../auth/sessions";
import { HttpError, parseBody, requireAuth } from "../http";
import type { AppContext } from "../app";

const SETUP_KEY = "setup_completed";

/** Login and setup forms get 10 tries per minute per IP. */
const strictLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export async function authRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, config } = ctx;

  async function startSession(
    request: FastifyRequest,
    reply: FastifyReply,
    user: PublicUser,
  ): Promise<void> {
    const session = await createSession(db, user.id, {
      days: config.SESSION_DAYS,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    reply.setCookie(SESSION_COOKIE, session.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.protocol === "https",
      expires: session.expiresAt,
    });
  }

  app.get("/api/setup/status", async (): Promise<SetupStatus> => {
    const rows = await db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, SETUP_KEY));
    return { needsSetup: rows.length === 0 };
  });

  app.post("/api/setup", { config: strictLimit }, async (request, reply) => {
    const input = parseBody(setupSchema, request, reply);
    if (!input) return;

    const passwordHash = await hashPassword(input.password);

    // Claiming the setup_completed key is atomic, so two setups racing each other
    // cannot both create an admin.
    const user = await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(settings)
        .values({ key: SETUP_KEY, value: { at: new Date().toISOString() } })
        .onConflictDoNothing()
        .returning({ key: settings.key });
      if (claimed.length === 0) {
        throw new HttpError(409, "Setup is already done. Sign in instead.");
      }
      const [created] = await tx
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash })
        .returning({ id: users.id, email: users.email, name: users.name });
      if (!created) throw new Error("Admin user was not created");
      return created;
    });

    await audit(db, { action: "setup.completed", userId: user.id, ip: request.ip }, request.log);
    await startSession(request, reply, user);
    return reply.code(201).send({ user });
  });

  app.post("/api/auth/login", { config: strictLimit }, async (request, reply) => {
    const input = parseBody(loginSchema, request, reply);
    if (!input) return;

    const [found] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const valid = found
      ? await verifyPassword(found.passwordHash, input.password)
      : await fakeVerify(input.password);

    if (!found || !valid) {
      await audit(
        db,
        {
          action: "auth.login_failed",
          userId: found?.id ?? null,
          metadata: { email: input.email },
          ip: request.ip,
        },
        request.log,
      );
      throw new HttpError(401, "Email or password is wrong");
    }

    const user: PublicUser = { id: found.id, email: found.email, name: found.name };
    await startSession(request, reply, user);
    await audit(db, { action: "auth.login", userId: user.id, ip: request.ip }, request.log);
    return { user };
  });

  app.post("/api/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    await audit(
      db,
      { action: "auth.logout", userId: request.user?.id, ip: request.ip },
      request.log,
    );
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    return { user: request.user };
  });
}
