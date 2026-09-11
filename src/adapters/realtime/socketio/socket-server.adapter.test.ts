import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server as HttpServer } from "node:http";
import { createHttpServer } from "./socket-server.adapter.js";

describe("createHttpServer", () => {
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

  it("GET /health responde 200 con status ok y uptime", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      uptime: expect.any(Number),
    });
  });

  it("GET / sirve src/index.html", async () => {
    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    await expect(response.text()).resolves.toContain(
      "<title>QuizUp Games Stats</title>"
    );
  });

  it("una ruta desconocida responde 404 Not Found", async () => {
    const response = await fetch(`${baseUrl}/ruta-inexistente`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/plain");
    await expect(response.text()).resolves.toBe("Not Found");
  });
});
