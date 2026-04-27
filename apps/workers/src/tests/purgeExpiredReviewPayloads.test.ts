import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Env } from "../db/client";
import { intakeAttempts, messages } from "../db/schema";
import { handleScheduled } from "../cron/purgeExpiredReviewPayloads";
import { buildUpdateChain, createMockEnv, mockCreateDb } from "./helpers";

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    lt: vi.fn((column: unknown, value: unknown) => ({
      __op: "lt" as const,
      column,
      value,
    })),
  };
});

const stubController = {} as ScheduledController;
const stubCtx = {} as ExecutionContext;

describe("handleScheduled (purgeExpiredReviewPayloads)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits when no DB connection is configured", async () => {
    const env = createMockEnv();
    env.HYPERDRIVE = null as unknown as Env["HYPERDRIVE"];
    env.DATABASE_URL = undefined;

    await handleScheduled(stubController, env, stubCtx);

    expect(vi.mocked(createDb)).not.toHaveBeenCalled();
  });

  it("issues UPDATE intake_attempts SET review_payload=null WHERE reviewPayloadExpiresAt < now()", async () => {
    const { lt } = await import("drizzle-orm");
    const { updateMock, setMock, whereMock } = buildUpdateChain([]);
    const deleteWhereMock = vi.fn().mockResolvedValue([]);
    const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });
    mockCreateDb({ update: updateMock, delete: deleteMock });

    const fixedNow = new Date("2026-04-24T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const env = createMockEnv();

    await handleScheduled(stubController, env, stubCtx);

    vi.useRealTimers();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(intakeAttempts);

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ reviewPayload: null });

    expect(vi.mocked(lt)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(lt)).toHaveBeenNthCalledWith(
      1,
      intakeAttempts.reviewPayloadExpiresAt,
      fixedNow,
    );

    expect(whereMock).toHaveBeenCalledTimes(1);
    const whereArg = whereMock.mock.calls[0]?.[0] as {
      __op: "lt";
      column: unknown;
      value: Date;
    };
    expect(whereArg.__op).toBe("lt");
    expect(whereArg.column).toBe(intakeAttempts.reviewPayloadExpiresAt);
    expect(whereArg.value).toEqual(fixedNow);

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(messages);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
    const deleteWhereArg = deleteWhereMock.mock.calls[0]?.[0] as {
      __op: "lt";
      column: unknown;
      value: Date;
    };
    expect(deleteWhereArg.__op).toBe("lt");
    expect(deleteWhereArg.column).toBe(messages.expiresAt);
    expect(deleteWhereArg.value).toEqual(fixedNow);
  });
});
