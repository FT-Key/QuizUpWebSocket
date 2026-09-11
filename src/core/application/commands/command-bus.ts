import type { Clock } from "../ports/clock.js";
import type { Logger } from "../ports/logger.js";
import type { Command, CommandContext } from "./command.js";
import { withLogging, withValidation, type ExecuteFn } from "./decorators.js";

export interface CommandBus<UC> {
  /**
   * Valida, loguea y ejecuta el command `type`. Un tipo desconocido no lanza:
   * se avisa por `logger.warn` y se ignora (paridad con el router legacy, que
   * ante un evento fuera del contrato no tiene nada que hacer).
   */
  dispatch(type: string, raw: unknown, context: CommandContext): Promise<void>;
}

/**
 * Registro de commands de un bundle de casos de uso. Compone
 * `withLogging(withValidation(schema, execute))` una sola vez por command;
 * el mapeo de errores a eventos (p. ej. `join-error`) vive en el caso de uso.
 */
export function createCommandBus<UC>(deps: {
  commands: readonly Command<UC>[];
  useCases: UC;
  logger: Logger;
  clock: Clock;
}): CommandBus<UC> {
  const { commands, useCases, logger, clock } = deps;

  const handlers = new Map<string, ExecuteFn<UC>>();
  for (const command of commands) {
    const validated = withValidation(command.schema, command.execute);
    handlers.set(command.type, withLogging({ logger, clock, type: command.type }, validated));
  }

  return {
    async dispatch(type, raw, context) {
      const handler = handlers.get(type);
      if (!handler) {
        logger.warn(`command desconocido: ${type}`, { socketId: context.socketId });
        return;
      }
      await handler({ payload: raw, context, useCases });
    },
  };
}
