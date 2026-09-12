/**
 * Sanitización de datos para logs (US-17, BL-16): proyecta `Error` a
 * `{ name, message, stack? }` —sin props adjuntas ni payloads— y redacta URIs
 * de Mongo embebidas en cualquier string. Helper puro y sin dependencias:
 * el logger conserva su firma y el caller decide qué pasa.
 */

/** `mongodb://...` / `mongodb+srv://...` hasta el primer espacio o comilla. */
const MONGO_URI_RE = /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi;

/** Reemplaza por `[redacted-mongodb-uri]` cada URI de Mongo embebida en `text`. */
export function redactSecrets(text: string): string {
  return text.replace(MONGO_URI_RE, "[redacted-mongodb-uri]");
}

/**
 * `Error` → `{ name, message, stack? }` con secretos redactados (sin props
 * adjuntas; `stack` se omite si el Error no lo trae); cualquier otro valor →
 * `String(...)` redactado.
 */
export function toSafeLogDetail(cause: unknown): unknown {
  if (cause instanceof Error) {
    const detail: { name: string; message: string; stack?: string } = {
      name: cause.name,
      message: redactSecrets(cause.message),
    };
    if (cause.stack) detail.stack = redactSecrets(cause.stack);
    return detail;
  }
  return redactSecrets(String(cause));
}
