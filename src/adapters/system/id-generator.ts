import { randomUUID } from "node:crypto";
import type { IdGenerator } from "../../core/application/ports/id-generator.js";

export function createUuidGenerator(): IdGenerator {
  return { next: () => randomUUID() };
}
