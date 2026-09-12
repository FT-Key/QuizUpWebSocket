import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLogger — prefijo de contexto", () => {
  it("emite `info` con el prefijo `[contexto]`", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    createLogger({ level: "info", context: "test" }).info("hola");

    expect(info).toHaveBeenCalledWith("[test] hola");
  });
});

describe("createLogger — nivel mínimo", () => {
  it("filtra `debug` cuando el nivel es `info`", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    createLogger({ level: "info", context: "test" }).debug("x");

    expect(debug).not.toHaveBeenCalled();
  });

  it("con nivel `error` silencia debug/info/warn y emite `error`", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createLogger({ level: "error", context: "test" });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[test] e");
  });
});

describe("createLogger — meta", () => {
  it("reenvía el meta como segundo argumento del console", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const meta = { playerId: "p1" };

    createLogger({ level: "info", context: "test" }).info("hola", meta);

    expect(info).toHaveBeenCalledWith("[test] hola", meta);
  });
});
