/**
 * Regresión BL-18 (US-18): el 500 del borde HTTP no loguea el error crudo.
 * Fuerza el fallo de `readFile` con una URI de Mongo embebida y verifica que
 * `console.error` recibe el detalle redactado por `toSafeLogDetail`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server as HttpServer } from "node:http";

const { SECRET_URI } = vi.hoisted(() => ({
  SECRET_URI: "mongodb://user:pass@host/db",
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi
      .fn()
      .mockRejectedValue(new Error(`connect failed to ${SECRET_URI}`)),
  };
});

import { createHttpServer } from "./socket-server.adapter.js";

describe("createHttpServer — log seguro del 500 (BL-18)", () => {
  let server: HttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = createHttpServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("No se pudo obtener el puerto efímero del server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("responde 500 y loguea el detalle redactado, sin la URI de Mongo", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await fetch(`${baseUrl}/`);

      expect(response.status).toBe(500);
      await expect(response.text()).resolves.toBe("Internal Server Error");

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [label, detail] = errorSpy.mock.calls[0];
      expect(label).toBe("[socket-server.adapter] httpServer error:");

      const serialized = JSON.stringify(detail);
      expect(serialized).toContain("[redacted-mongodb-uri]");
      expect(serialized).not.toContain(SECRET_URI);
      expect(serialized).not.toContain("user:pass");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
