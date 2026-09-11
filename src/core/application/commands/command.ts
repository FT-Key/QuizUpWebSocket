import type { ZodTypeAny, infer as ZodInfer } from "zod";

/**
 * Contexto de transporte de un command (patrón Command, §5 del design note).
 * Puramente estructural: el socket entrante se identifica sin acoplar `core`
 * a ninguna librería de tiempo real (solo un `string`).
 */
export interface CommandContext {
  readonly socketId: string;
}

export interface Command<UC> {
  readonly type: string;
  readonly schema: ZodTypeAny;
  readonly execute: (args: {
    payload: unknown;
    context: CommandContext;
    useCases: UC;
  }) => Promise<void>;
}

/**
 * Asocia un evento cliente→servidor con su schema Zod y su delegación al caso
 * de uso. El payload llega `unknown` (lo crudo del transporte) y el `CommandBus`
 * lo valida con `withValidation` antes de invocar `execute`.
 */
export function createCommand<UC, Schema extends ZodTypeAny>(def: {
  type: string;
  schema: Schema;
  execute: (args: {
    payload: ZodInfer<Schema>;
    context: CommandContext;
    useCases: UC;
  }) => Promise<void>;
}): Command<UC> {
  return {
    type: def.type,
    schema: def.schema,
    // El bus compone `withValidation` antes de ejecutar (ver `command-bus.ts`),
    // así que a estas alturas el payload ya cumple `Schema`.
    execute: async ({ payload, context, useCases }) =>
      def.execute({ payload: payload as ZodInfer<Schema>, context, useCases }),
  };
}
