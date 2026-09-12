import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { ValidationError } from "../../domain/errors.js";
import type { LogLevel, Logger } from "../ports/logger.js";
import type { UseCase } from "../use-cases/use-case.js";
import { createCommand } from "./command.js";
import { createCommandBus } from "./command-bus.js";
import { withMetrics, type ExecuteFn } from "./decorators.js";

const pingSchema = z.object({ value: z.number() });

interface TestUseCases {
  ping: UseCase<{ value: number }, string>;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  meta?: unknown;
}

interface RecordingLogger extends Logger {
  readonly entries: LogEntry[];
}

function createRecordingLogger(): RecordingLogger {
  const entries: LogEntry[] = [];

  const record = (level: LogLevel) => (message: string, meta?: unknown) => {
    entries.push({ level, message, meta });
  };

  return {
    entries,
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  };
}

function setup(options: { advanceMs?: number } = {}) {
  const clock = createFixedClock(1_000);
  const logger = createRecordingLogger();
  const calls: Array<{ value: number }> = [];

  const ping: UseCase<{ value: number }, string> = {
    async execute(input) {
      calls.push(input);
      if (options.advanceMs !== undefined) clock.advance(options.advanceMs);
      return `pong:${input.value}`;
    },
  };

  const commands = [
    createCommand<TestUseCases, typeof pingSchema>({
      type: "ping",
      schema: pingSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.ping.execute(payload);
      },
    }),
  ];

  const bus = createCommandBus<TestUseCases>({
    commands,
    useCases: { ping },
    logger,
    clock,
  });

  return { bus, logger, calls, clock };
}

describe("CommandBus", () => {
  it("despacha el command y pasa el payload validado al caso de uso", async () => {
    const { bus, calls } = setup();

    await bus.dispatch("ping", { value: 7 }, { socketId: "s-1" });

    expect(calls).toEqual([{ value: 7 }]);
  });

  it("ignora un tipo desconocido con warn y sin ejecutar nada", async () => {
    const { bus, logger, calls } = setup();

    await expect(
      bus.dispatch("poing", { value: 1 }, { socketId: "s-1" })
    ).resolves.toBeUndefined();

    expect(calls).toEqual([]);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].level).toBe("warn");
    expect(logger.entries[0].message).toContain("poing");
  });

  it("con payload inválido lanza ValidationError y NO ejecuta el caso de uso", async () => {
    const { bus, logger, calls } = setup();

    const error = await bus
      .dispatch("ping", { value: "no-es-numero" }, { socketId: "s-1" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toContain("value");
    expect((error as Error).message).toContain("Expected number");
    expect(calls).toEqual([]);
    expect(logger.entries.map((entry) => entry.level)).toEqual(["debug", "error"]);
  });

  it("loguea inicio y fin con la duración medida por el Clock inyectado", async () => {
    const { bus, logger } = setup({ advanceMs: 25 });

    await bus.dispatch("ping", { value: 3 }, { socketId: "s-9" });

    const start = logger.entries.find((entry) => entry.level === "debug");
    const done = logger.entries.find((entry) => entry.level === "info");

    expect(start?.message).toContain("ping");
    expect(start?.meta).toEqual({ socketId: "s-9" });
    expect(done?.message).toContain("ping");
    expect(done?.meta).toEqual({ durationMs: 25 });
  });

  it("loguea el fallo con error y duración, y lo propaga", async () => {
    const logger = createRecordingLogger();
    const clock = createFixedClock(500);
    const boom = createCommand<TestUseCases, typeof pingSchema>({
      type: "boom",
      schema: pingSchema,
      execute: async () => {
        clock.advance(40);
        throw new Error("explota");
      },
    });
    const bus = createCommandBus<TestUseCases>({
      commands: [boom],
      useCases: { ping: { execute: async () => "nunca" } },
      logger,
      clock,
    });

    await expect(bus.dispatch("boom", { value: 1 }, { socketId: "s-2" })).rejects.toThrow(
      "explota"
    );

    const failure = logger.entries.find((entry) => entry.level === "error");
    expect(failure?.message).toContain("boom");
    expect(failure?.meta).toEqual({ durationMs: 40, error: "explota" });
  });
});

describe("withMetrics", () => {
  it("es un punto de extensión no-op que delega la ejecución", async () => {
    let calls = 0;
    const fn: ExecuteFn<TestUseCases> = async () => {
      calls += 1;
    };
    const wrapped = withMetrics(fn);

    await wrapped({
      payload: undefined,
      context: { socketId: "s-1" },
      useCases: { ping: { execute: async () => "x" } },
    });

    expect(calls).toBe(1);
  });
});
