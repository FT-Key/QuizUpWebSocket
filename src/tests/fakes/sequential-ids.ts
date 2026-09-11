import type { IdGenerator } from "../../core/application/ports/id-generator.js";

/** `IdGenerator` de test (US-06): ids deterministas `id-1`, `id-2`, ... */
export function createSequentialIds(prefix = "id"): IdGenerator {
  let sequence = 0;

  return {
    next: () => `${prefix}-${++sequence}`,
  };
}
