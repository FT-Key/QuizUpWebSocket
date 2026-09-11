import type { ZodError, ZodTypeAny } from "zod";
import { ValidationError } from "../../domain/errors.js";
import type { Clock } from "../ports/clock.js";
import type { Logger } from "../ports/logger.js";
import type { CommandContext } from "./command.js";

/** Firma que comparten los commands y sus decorators. */
export type ExecuteFn<UC> = (args: {
  payload: unknown;
  context: CommandContext;
  useCases: UC;
}) => Promise<void>;

/** Mensaje legible para el cliente: `campo: motivo; otroCampo: motivo`. */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(payload)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Valida el payload crudo contra el schema del evento. Si falla, lanza
 * `ValidationError` (DomainError) con mensaje legible y **no ejecuta** el handler.
 */
export function withValidation<UC>(schema: ZodTypeAny, fn: ExecuteFn<UC>): ExecuteFn<UC> {
  return async (args) => {
    const result = schema.safeParse(args.payload);
    if (!result.success) {
      throw new ValidationError(formatZodError(result.error));
    }
    await fn({ ...args, payload: result.data });
  };
}

/**
 * Loguea inicio/fin/duración con el `Clock` inyectado (el reloj del sistema no
 * se consulta dentro de core). Un error se registra y se vuelve a lanzar para
 * que el adapter de transporte decida.
 */
export function withLogging<UC>(
  deps: { logger: Logger; clock: Clock; type: string },
  fn: ExecuteFn<UC>
): ExecuteFn<UC> {
  const { logger, clock, type } = deps;

  return async (args) => {
    const startedAt = clock.now();
    logger.debug(`command ${type} start`, { socketId: args.context.socketId });

    try {
      await fn(args);
      logger.info(`command ${type} done`, { durationMs: clock.now() - startedAt });
    } catch (error) {
      logger.error(`command ${type} failed`, {
        durationMs: clock.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

/**
 * Punto de extensión (US-06: no-op documentado). Un contador/métrica real
 * (Observer) llegará en una US posterior; envolver no altera la ejecución.
 */
export function withMetrics<UC>(fn: ExecuteFn<UC>): ExecuteFn<UC> {
  return fn;
}
