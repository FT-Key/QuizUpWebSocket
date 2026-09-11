import { afterEach, describe, expect, it, vi } from "vitest";
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
