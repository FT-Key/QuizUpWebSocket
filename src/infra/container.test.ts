import { afterEach, describe, expect, it, vi } from "vitest";
import { GameBuilder } from "../tests/builders/game-builder.js";
import type { AppConfig } from "./config.js";
import { createContainer } from "./container.js";

const config: AppConfig = {
  port: 4000,
  mongoUri: "mongodb://localhost:27017/quizup",
  gameExpiryMinutes: 60,
  corsOrigin: "*",
  logLevel: "info",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createContainer — sin singletons", () => {
  it("devuelve un grafo nuevo en cada llamada (objetos raíz y dependencias distintos)", () => {
    const first = createContainer(config);
    const second = createContainer(config);

    expect(first).not.toBe(second);
    expect(first.clock).not.toBe(second.clock);
    expect(first.ids).not.toBe(second.ids);
    expect(first.logger).not.toBe(second.logger);
  });
});

describe("createContainer — clock e ids funcionales", () => {
  it("el clock sigue la hora del sistema y el generador produce ids no vacíos", () => {
    vi.setSystemTime(new Date(1_700_000_000_000));
    const { clock, ids } = createContainer(config);

    expect(clock.now()).toBe(1_700_000_000_000);
    expect(ids.next().length).toBeGreaterThan(0);
  });
});

describe("createContainer — logger con nivel y contexto del config", () => {
  it("emite con el prefijo [quizup-ws] cuando logLevel es info", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    createContainer(config).logger.info("hola");

    expect(info).toHaveBeenCalledWith("[quizup-ws] hola");
  });
});

describe("createContainer — grafo US-06", () => {
  it("expone los 13 casos de uso, los 12 commands del contrato y un bus", () => {
    const container = createContainer(config);

    expect(Object.keys(container.useCases).sort()).toEqual([
      "cancelStaleGames",
      "closeGame",
      "emitDashboard",
      "finishGame",
      "forceFinishQuestion",
      "joinAdminRoom",
      "joinGame",
      "leaveGame",
      "lockGame",
      "nextQuestion",
      "requestGameState",
      "startGame",
      "submitAnswer",
    ]);

    expect(container.commands.map((command) => command.type)).toEqual([
      "join-game",
      "join-admin",
      "start-game",
      "next-question",
      "finish-question",
      "finish-game",
      "submit-answer",
      "leave-game",
      "lock-game",
      "close-game",
      "request-dashboard",
      "request-game-state",
    ]);

    expect(typeof container.bus.dispatch).toBe("function");
  });

  it("deriva la política de expiración de config.gameExpiryMinutes", () => {
    const now = 1_700_000_000_000;
    const { policy } = createContainer(config);

    const fresh = new GameBuilder().withCreatedAt(new Date(now - 60_000)).build();
    const stale = new GameBuilder().withCreatedAt(new Date(now - 61 * 60_000)).build();

    expect(policy.isExpired(fresh, now)).toBe(false);
    expect(policy.isExpired(stale, now)).toBe(true);
  });

  it("el bus ignora un tipo desconocido con warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const container = createContainer(config);

    await expect(
      container.bus.dispatch("evento-inexistente", {}, { socketId: "s-1" })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("despacha un command válido de extremo a extremo (join-admin → gateway)", async () => {
    const container = createContainer(config);
    const joinAdminRoom = vi.spyOn(container.gateway, "joinAdminRoom");

    await container.bus.dispatch("join-admin", "123456", { socketId: "s-9" });

    expect(joinAdminRoom).toHaveBeenCalledWith("s-9", "123456");
  });

  it("cada container posee su propio gateway, timers, policy, use cases, commands y bus", () => {
    const first = createContainer(config);
    const second = createContainer(config);

    expect(first.gateway).not.toBe(second.gateway);
    expect(first.timers).not.toBe(second.timers);
    expect(first.policy).not.toBe(second.policy);
    expect(first.useCases).not.toBe(second.useCases);
    expect(first.useCases.joinGame).not.toBe(second.useCases.joinGame);
    expect(first.commands).not.toBe(second.commands);
    expect(first.bus).not.toBe(second.bus);
  });
});
