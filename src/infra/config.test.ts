import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const MONGO_URI = "mongodb://localhost:27017/quizup";

describe("loadConfig — defaults", () => {
  it("usa los defaults cuando solo hay MONGODB_URI", () => {
    const config = loadConfig({ MONGODB_URI: MONGO_URI });

    expect(config).toEqual({
      port: 4000,
      mongoUri: MONGO_URI,
      gameExpiryMinutes: 60,
      corsOrigin: "*",
      logLevel: "info",
    });
  });
});

describe("loadConfig — override", () => {
  it("respeta las variables de entorno definidas", () => {
    const config = loadConfig({
      MONGODB_URI: MONGO_URI,
      PORT: "4123",
      GAME_EXPIRY_MINUTES: "15",
      CORS_ORIGIN: "http://localhost:3000",
      LOG_LEVEL: "debug",
    });

    expect(config).toEqual({
      port: 4123,
      mongoUri: MONGO_URI,
      gameExpiryMinutes: 15,
      corsOrigin: "http://localhost:3000",
      logLevel: "debug",
    });
  });
});

describe("loadConfig — MONGODB_URI", () => {
  it.each([
    ["ausente", {}],
    ["vacía", { MONGODB_URI: "" }],
    ["solo espacios", { MONGODB_URI: "   " }],
  ])("lanza error si MONGODB_URI está %s", (_label, env) => {
    expect(() => loadConfig(env)).toThrow(/MONGODB_URI/);
  });
});

describe("loadConfig — PORT inválido", () => {
  it.each(["abc", "0", "70000", "4000.5"])("lanza error con PORT=%s", (port) => {
    expect(() => loadConfig({ MONGODB_URI: MONGO_URI, PORT: port })).toThrow(/PORT/);
  });
});

describe("loadConfig — GAME_EXPIRY_MINUTES inválido", () => {
  it.each(["abc", "0", "-5"])(
    "cae al default 60 con GAME_EXPIRY_MINUTES=%s (paridad con el legacy)",
    (minutes) => {
      const config = loadConfig({ MONGODB_URI: MONGO_URI, GAME_EXPIRY_MINUTES: minutes });

      expect(config.gameExpiryMinutes).toBe(60);
    }
  );
});

describe("loadConfig — LOG_LEVEL desconocido", () => {
  it("cae al default info", () => {
    const config = loadConfig({ MONGODB_URI: MONGO_URI, LOG_LEVEL: "verbose" });

    expect(config.logLevel).toBe("info");
  });
});
