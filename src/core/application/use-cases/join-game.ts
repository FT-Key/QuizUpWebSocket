import type { Game } from "../../domain/game.js";
import { GAME_STATUS, QUESTION_NOT_STARTED } from "../../domain/game/constants.js";
import type { Player, PlayerAvatar } from "../../domain/player.js";
import { ConflictError, NotFoundError } from "../../domain/errors.js";
import { cancel } from "../../domain/game-state-machine.js";
import type { Clock } from "../ports/clock.js";
import type { GameCleanupPolicy } from "../ports/game-cleanup-policy.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

/** Mensaje compartido por los guards de alta nueva y reconexión (contrato de `join-error`). */
const INVALID_JOIN_DATA_MESSAGE = "Invalid join data";

export interface JoinGameInput {
  gameId: string;
  /** `null` (el cliente lo emite en el primer join) equivale a ausente: alta nueva. */
  playerId?: string | null;
  playerName?: string;
  avatar?: PlayerAvatar;
  socketId: string;
}

export interface JoinGameOutput {
  player: Player;
  game: Game;
}

export type JoinGameUseCase = UseCase<JoinGameInput, JoinGameOutput>;

export interface JoinGameDeps {
  readonly repo: GameRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly gateway: RealtimeGateway;
  readonly policy: GameCleanupPolicy;
}

/**
 * `join-game`: alta de jugador o reconexión por `playerId`.
 * Paridad con `playerHandlers.onJoinGame`: mismos guards, mensajes de
 * `join-error` y orden de emisiones (game-state→admins, joined→socket,
 * player-joined→admins, game-updated→game+admins, update-dashboard).
 * La lectura inicial es SIEMPRE fresca de Mongo (`findByIdFresh`, paridad con el
 * `GameModel.findOne` + `gameStore.addGameFromDb` legacy): el join REST de Next
 * escribe la partida desde otro proceso y la copia cacheada del WS puede estar
 * stale (sin ese jugador). El resto de handlers mantiene `findById` cache-first.
 * Los errores se emiten al socket y además se lanzan como `DomainError` (D6).
 */
export function createJoinGameUseCase(deps: JoinGameDeps): JoinGameUseCase {
  const { repo, clock, ids, gateway, policy } = deps;

  return {
    async execute({ gameId, playerId, playerName, avatar, socketId }) {
      const game = await repo.findByIdFresh(gameId);
      if (!game) {
        const message = "Game not found";
        gateway.toSocket(socketId, "join-error", { message });
        throw new NotFoundError(message);
      }

      let player: Player;

      if (playerId) {
        const target = game.players.find((p) => p.id === playerId);
        if (!target) {
          const message = INVALID_JOIN_DATA_MESSAGE;
          gateway.toSocket(socketId, "join-error", { message });
          throw new NotFoundError(message);
        }

        const resolvedAvatar: PlayerAvatar | undefined = avatar
          ? {
              seed: avatar.seed || target.avatar?.seed || target.name,
              accessories: avatar.accessories?.length
                ? avatar.accessories
                : target.avatar?.accessories,
            }
          : target.avatar ?? undefined;

        if (
          avatar &&
          JSON.stringify(target.avatar ?? null) !== JSON.stringify(resolvedAvatar ?? null)
        ) {
          target.avatar = resolvedAvatar;
          await repo.updatePlayers(gameId, [target]);
        }

        target.avatar = resolvedAvatar;
        player = target;
      } else {
        if (!playerName) {
          const message = INVALID_JOIN_DATA_MESSAGE;
          gateway.toSocket(socketId, "join-error", { message });
          throw new NotFoundError(message);
        }

        if (game.locked) {
          const message = "El ingreso está bloqueado";
          gateway.toSocket(socketId, "join-error", { message });
          throw new ConflictError(message);
        }

        if (game.status === GAME_STATUS.WAITING && policy.isExpired(game, clock.now())) {
          cancel(game);
          await repo.save(game);
          const message = "La partida fue cerrada por inactividad";
          gateway.toSocket(socketId, "join-error", { message });
          throw new ConflictError(message);
        }

        if (game.status !== GAME_STATUS.WAITING) {
          const message = "La partida ya comenzó";
          gateway.toSocket(socketId, "join-error", { message });
          throw new ConflictError(message);
        }

        player = {
          id: ids.next(),
          name: playerName,
          gameId,
          answers: {},
          score: 0,
          joinedAt: new Date(clock.now()),
          avatar: avatar ?? { seed: playerName },
        };
        game.players.push(player);
        await repo.addPlayer(gameId, player);
      }

      gateway.joinGameRoom(socketId, gameId);

      const currentQuestionIndex = game.currentQuestionIndex;
      gateway.toAdmins(gameId, "game-state", {
        game,
        currentQuestion: game.questions[currentQuestionIndex] ?? null,
        currentQuestionIndex,
        // Paridad `playerHandlers.ts:185-189`: en join NO se clampea a 0
        // (puede llegar negativo si la pregunta ya venció).
        timeLeft:
          game.currentQuestionStartTime > QUESTION_NOT_STARTED
            ? game.questionTimeLimit - (clock.now() - game.currentQuestionStartTime)
            : game.questionTimeLimit,
      });

      gateway.toSocket(socketId, "joined", { player, game });
      gateway.toAdmins(gameId, "player-joined", { player, game });
      gateway.toGame(gameId, "game-updated", { game });
      gateway.toAdmins(gameId, "game-updated", { game });
      gateway.broadcast("update-dashboard", await repo.listAll());

      return { player, game };
    },
  };
}
