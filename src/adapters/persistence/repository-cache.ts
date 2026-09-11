import type { Clock } from "../../core/application/ports/clock.js";
import type { Game } from "../../core/domain/game.js";
import { createSystemClock } from "../system/clock.js";

/**
 * Política de la caché en memoria de `GameRepository` (US-08), compartida por
 * el adaptador Mongo y el fake en memoria para que la suite de contrato
 * verifique **una única semántica**:
 *
 * 1. TTL: se podan las partidas `finished`/`cancelled` con antigüedad mayor a
 *    `ttlMs` (default 1 h).
 * 2. Tope: si la caché supera `maxCachedGames` (default 500), se evictan las
 *    finalizadas más antiguas (`createdAt` asc) hasta respetar el máximo.
 *
 * Las `waiting`/`active` **nunca** se podan: podar una partida en curso es un
 * riesgo mayor que exceder el tope (D3). Las partidas podadas no se destruyen:
 * `findById` las recarga desde Mongo si vuelven a consultarse.
 */
export interface RepositoryCacheOptions {
  /** Reloj inyectable para el cálculo del TTL (default: reloj del sistema). */
  clock?: Clock;
  /** Antigüedad máxima de una partida finalizada en caché (default 1 h). */
  ttlMs?: number;
  /** Tamaño máximo de la caché (default 500). */
  maxCachedGames?: number;
}

export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_MAX_CACHED_GAMES = 500;

const PRUNABLE_STATUSES: ReadonlySet<Game["status"]> = new Set(["finished", "cancelled"]);

export function resolveRepositoryCacheOptions(
  options: RepositoryCacheOptions = {}
): Required<RepositoryCacheOptions> {
  return {
    clock: options.clock ?? createSystemClock(),
    ttlMs: options.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    maxCachedGames: options.maxCachedGames ?? DEFAULT_MAX_CACHED_GAMES,
  };
}

/** Aplica la política TTL + tope sobre `cache`; devuelve el total eliminado. */
export function pruneRepositoryCache(
  cache: Map<string, Game>,
  options: Required<RepositoryCacheOptions>
): number {
  const { clock, ttlMs, maxCachedGames } = options;
  const now = clock.now();
  let pruned = 0;

  // Primera pasada: TTL de las finalizadas/anceladas.
  for (const [gameId, game] of cache) {
    if (!PRUNABLE_STATUSES.has(game.status)) continue;
    if (now - game.createdAt.getTime() > ttlMs) {
      cache.delete(gameId);
      pruned += 1;
    }
  }

  // Segunda pasada: tope, evictando las finalizadas más antiguas.
  if (cache.size > maxCachedGames) {
    const evictable = [...cache.entries()]
      .filter(([, game]) => PRUNABLE_STATUSES.has(game.status))
      .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const [key] of evictable) {
      if (cache.size <= maxCachedGames) break;
      if (cache.delete(key)) pruned += 1;
    }
  }

  return pruned;
}
