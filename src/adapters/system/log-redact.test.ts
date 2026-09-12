import { describe, expect, it } from "vitest";
import { redactSecrets, toSafeLogDetail } from "./log-redact.js";

const MONGO_URI = "mongodb://user:secret@host:27017/quizup";
const MONGO_SRV_URI = "mongodb+srv://user:secret@cluster.example.net/db";

describe("redactSecrets", () => {
  it("redacta una URI mongodb:// embebida en el texto", () => {
    expect(redactSecrets(`no se pudo conectar a ${MONGO_URI}`)).toBe(
      "no se pudo conectar a [redacted-mongodb-uri]"
    );
  });

  it("redacta una URI mongodb+srv:// y conserva el texto circundante", () => {
    expect(redactSecrets(`fallo ${MONGO_SRV_URI} host inalcanzable`)).toBe(
      "fallo [redacted-mongodb-uri] host inalcanzable"
    );
  });

  it("deja intacto un mensaje sin secretos", () => {
    expect(redactSecrets("game X no encontrado")).toBe("game X no encontrado");
  });
});

describe("toSafeLogDetail — Error", () => {
  it("proyecta `{ name, message, stack }` con la URI redactada", () => {
    const cause = new Error(`connect failed: ${MONGO_URI}`);

    const detail = toSafeLogDetail(cause) as {
      name: string;
      message: string;
      stack?: string;
    };

    expect(detail.name).toBe("Error");
    expect(detail.message).toBe("connect failed: [redacted-mongodb-uri]");
    expect(detail.stack).toContain("[redacted-mongodb-uri]");
    expect(JSON.stringify(detail)).not.toContain("secret");
  });

  it("no copia props adjuntas del Error", () => {
    const cause = Object.assign(new Error("boom"), {
      uri: MONGO_URI,
      payload: { password: "secret" },
    });

    const detail = toSafeLogDetail(cause) as Record<string, unknown>;

    expect(Object.keys(detail).sort()).toEqual(["message", "name", "stack"]);
    expect(JSON.stringify(detail)).not.toContain(MONGO_URI);
  });
});

describe("toSafeLogDetail — no-Error", () => {
  it("devuelve un string redactado", () => {
    expect(toSafeLogDetail(`reintento con ${MONGO_URI}`)).toBe(
      "reintento con [redacted-mongodb-uri]"
    );
  });

  it("convierte a string un valor no-Error", () => {
    expect(toSafeLogDetail(42)).toBe("42");
  });
});
