import type { Clock } from "../core/application/ports/clock.js";
import type { IdGenerator } from "../core/application/ports/id-generator.js";
import type { Logger } from "../core/application/ports/logger.js";
import { createSystemClock } from "../adapters/system/clock.js";
import { createUuidGenerator } from "../adapters/system/id-generator.js";
import {
  createMongoGameRepository,
  type MongoGameRepository,
} from "../adapters/persistence/mongo/game-repository.mongo.js";
import type { AppConfig } from "./config.js";
import { createLogger } from "./logger.js";

/**
 * Composition root del proceso WS. Se amplía de forma aditiva en US-05..US-08.
 * Un container por proceso, creado por el bootstrap; nada más instancia
 * dependencias (ver skill de patrones: DI).
 */
export interface Container {
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly repo: MongoGameRepository;
}

export function createContainer(config: AppConfig): Container {
  return {
    logger: createLogger({ level: config.logLevel, context: "quizup-ws" }),
    clock: createSystemClock(),
    ids: createUuidGenerator(),
    // Construcción pura: el repo usa la conexión global de mongoose recién al invocar un método.
    repo: createMongoGameRepository(),
  };
}
