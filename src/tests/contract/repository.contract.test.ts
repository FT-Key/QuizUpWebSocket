/**
 * Suite de contrato compartida de `GameRepository` (US-05).
 *
 * El fake en memoria corre siempre; la variante Mongo queda `skip` sin
 * `MONGODB_URI_TEST` (D4: nunca se usa `MONGODB_URI` real en tests). Como `save`
 * es update-only (no crea), cada variante siembra con su mecanismo: el fake con
 * `seed()` y Mongo con `GameModel.create`.
 *
 * La variante Mongo recibe además `verifySaved`: el caso `save` comprueba el
 * contrato vía `findById` (que puede resolver de caché) y, con el hook, la
 * **escritura real** en `GameModel.findOne`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import type { Game } from "../../core/domain/game.js";
import type { GameRepository } from "../../core/application/ports/game-repository.js";
import type { GameDoc } from "../../types/db.js";
import { connectToMongo } from "../../adapters/persistence/mongo/connection.js";
import {
  createMongoGameRepository,
  type MongoGameRepository,
} from "../../adapters/persistence/mongo/game-repository.mongo.js";
import type { RepositoryCacheOptions } from "../../adapters/persistence/repository-cache.js";
import { GameModel } from "../../adapters/persistence/mongo/game.schema.js";
import {
  createInMemoryGameRepository,
  type InMemoryGameRepository,
} from "../fakes/in-memory-game-repository.js";
import { createFixedClock } from "../fakes/fixed-clock.js";
import { GameBuilder } from "../builders/game-builder.js";
import { PlayerBuilder } from "../builders/player-builder.js";

type VerifySaved = (game: Game) => Promise<void>;

/**
 * Suite de contrato de la poda (US-08): ambas variantes exponen `getCached`;
 * solo Mongo expone `cacheGame`, que siembra la caché tras crear el doc.
 */
interface CacheAwareGameRepository extends GameRepository {
  getCached(gameId: string): Game | undefined;
  cacheGame?(game: Game): void;
}

const GAME_CODE_PREFIX = "ws05";

function repositoryContractTests<TRepo extends CacheAwareGameRepository>(
  label: string,
  createRepo: (options?: RepositoryCacheOptions) => Promise<TRepo> | TRepo,
  seedGame: (repo: TRepo, game: Game) => Promise<void>,
  verifySaved?: VerifySaved
): void {
  describe(`GameRepository contract — ${label}`, () => {
    const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    let sequence = 0;
    let repo: TRepo;

    const nextCode = () => `${GAME_CODE_PREFIX}-${label}-${runId}-${++sequence}`;

    beforeEach(async () => {
      repo = await createRepo();
    });

    it("findById devuelve null en miss y el juego con id === gameCode en hit", async () => {
      const code = nextCode();
      await seedGame(repo, new GameBuilder().withId(code).build());

      expect(await repo.findById(`${code}-missing`)).toBeNull();

      const found = await repo.findById(code);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(code);
    });

    it("save actualiza status, índices y locked, y NO toca players (US-19)", async () => {
      const code = nextCode();
      const seeded = new GameBuilder()
        .withId(code)
        .withStatus("waiting")
        .withPlayers(
          new PlayerBuilder()
            .withId(`${code}-p1`)
            .withGameId(code)
            .withAnswers({ "q-1": 1 })
            .withScore(2001)
            .build()
        )
        .build();
      await seedGame(repo, seeded);

      // El argumento de `save` trae P2 (jugador distinto) que NO debe persistirse:
      // `save` es state-only y la colección va por operaciones diferenciales.
      const impostor = new PlayerBuilder().withId(`${code}-p2`).withGameId(code).build();
      const updated = new GameBuilder()
        .withId(code)
        .withStatus("active")
        .withCurrentQuestionIndex(2)
        .withCurrentQuestionStartTime(1234)
        .withQuestionTimeLimit(30000)
        .withLocked(true)
        .withPlayers(impostor)
        .build();
      await repo.save(updated);

      const found = await repo.findById(code);
      expect(found!.status).toBe("active");
      expect(found!.currentQuestionIndex).toBe(2);
      expect(found!.currentQuestionStartTime).toBe(1234);
      expect(found!.questionTimeLimit).toBe(30000);
      expect(found!.locked).toBe(true);
      expect(found!.players.map((p) => p.id)).toEqual([`${code}-p1`]);
      expect(found!.players.some((p) => p.id === `${code}-p2`)).toBe(false);

      // Solo la variante Mongo: `findById` puede resolver de la caché que `save`
      // refresca, así que se verifica además la escritura real en la DB.
      if (verifySaved) await verifySaved(updated);
    });

    it("addPlayer agrega al final sin pisar a los jugadores existentes", async () => {
      const code = nextCode();
      const ana = new PlayerBuilder()
        .withId(`${code}-ana`)
        .withName("Ana")
        .withGameId(code)
        .build();
      await seedGame(repo, new GameBuilder().withId(code).withPlayers(ana).build());

      const luis = new PlayerBuilder()
        .withId(`${code}-luis`)
        .withName("Luis")
        .withGameId(code)
        .withAnswers({ "q-1": 1 })
        .withScore(2001)
        .build();
      await repo.addPlayer(code, luis);

      const found = await repo.findById(code);
      expect(found!.players.map((p) => p.id)).toEqual([`${code}-ana`, `${code}-luis`]);
      expect(found!.players[1]).toMatchObject({
        id: `${code}-luis`,
        name: "Luis",
        gameId: code,
        answers: { "q-1": 1 },
        score: 2001,
      });
    });

    it("addPlayer es idempotente por id: dos altas con el mismo id dejan un solo jugador", async () => {
      const code = nextCode();
      await seedGame(repo, new GameBuilder().withId(code).build());

      const player = new PlayerBuilder()
        .withId(`${code}-p1`)
        .withName("Primero")
        .withGameId(code)
        .build();
      await repo.addPlayer(code, player);
      // Segunda alta con el mismo id y datos distintos: ni duplica ni modifica.
      await repo.addPlayer(code, { ...player, name: "Duplicado", score: 9999 });

      const found = await repo.findById(code);
      expect(found!.players).toHaveLength(1);
      expect(found!.players[0].id).toBe(`${code}-p1`);
      expect(found!.players[0].name).toBe("Primero");
      expect(found!.players[0].score).toBe(0);
    });

    it("addPlayer en partida inexistente es no-op y findById sigue null", async () => {
      const code = `${nextCode()}-missing`;
      const player = new PlayerBuilder().withId(`${code}-p1`).withGameId(code).build();

      await repo.addPlayer(code, player);

      expect(await repo.findById(code)).toBeNull();
      expect(repo.getCached(code)).toBeUndefined();
    });

    it("removePlayer quita solo al jugador objetivo", async () => {
      const code = nextCode();
      const ana = new PlayerBuilder().withId(`${code}-ana`).withGameId(code).build();
      const luis = new PlayerBuilder().withId(`${code}-luis`).withGameId(code).build();
      await seedGame(repo, new GameBuilder().withId(code).withPlayers(ana, luis).build());

      await repo.removePlayer(code, ana.id);

      const found = await repo.findById(code);
      expect(found!.players.map((p) => p.id)).toEqual([`${code}-luis`]);
    });

    it("removePlayer es idempotente y no-op en partida inexistente", async () => {
      const code = nextCode();
      const ana = new PlayerBuilder().withId(`${code}-ana`).withGameId(code).build();
      await seedGame(repo, new GameBuilder().withId(code).withPlayers(ana).build());

      await repo.removePlayer(code, ana.id);
      await repo.removePlayer(code, ana.id); // segunda vez: no-op

      expect((await repo.findById(code))!.players).toHaveLength(0);

      await repo.removePlayer(`${code}-missing`, ana.id);
      expect(await repo.findById(`${code}-missing`)).toBeNull();
    });

    it("updatePlayers actualiza answers, score y avatar de existentes e ignora ids desconocidos", async () => {
      const code = nextCode();
      const ana = new PlayerBuilder()
        .withId(`${code}-ana`)
        .withGameId(code)
        .withAnswers({ "q-1": 0 })
        .withScore(1)
        .build();
      const luis = new PlayerBuilder().withId(`${code}-luis`).withGameId(code).build();
      await seedGame(repo, new GameBuilder().withId(code).withPlayers(ana, luis).build());

      const unknown = new PlayerBuilder().withId(`${code}-fantasma`).withGameId(code).build();
      await repo.updatePlayers(code, [
        {
          ...ana,
          answers: { "q-1": 1 },
          score: 2001,
          avatar: { seed: "ana-nueva", accessories: ["hat"] },
        },
        { ...luis, answers: { "q-1": 1, "q-2": 0 }, score: 1 },
        { ...unknown, score: 9999 },
      ]);

      const found = await repo.findById(code);
      expect(found!.players.map((p) => p.id)).toEqual([`${code}-ana`, `${code}-luis`]);

      const foundAna = found!.players.find((p) => p.id === `${code}-ana`);
      expect(foundAna!.answers).toEqual({ "q-1": 1 });
      expect(foundAna!.score).toBe(2001);
      expect(foundAna!.avatar).toEqual({ seed: "ana-nueva", accessories: ["hat"] });

      const foundLuis = found!.players.find((p) => p.id === `${code}-luis`);
      expect(foundLuis!.answers).toEqual({ "q-1": 1, "q-2": 0 });
      expect(foundLuis!.score).toBe(1);
      expect(foundLuis!.avatar).toBeUndefined();
    });

    it("findByPlayerId encuentra la partida del jugador y null en miss", async () => {
      const code = nextCode();
      const player = new PlayerBuilder().withId(`${code}-p1`).withGameId(code).build();
      await seedGame(repo, new GameBuilder().withId(code).withPlayer(player).build());

      const found = await repo.findByPlayerId(player.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(code);

      expect(await repo.findByPlayerId(`${code}-missing`)).toBeNull();
    });

    it("listAll devuelve las partidas ordenadas por createdAt desc", async () => {
      const base = Date.parse("2026-01-01T00:00:00.000Z");
      const oldest = nextCode();
      const middle = nextCode();
      const newest = nextCode();
      await seedGame(repo, new GameBuilder().withId(oldest).withCreatedAt(new Date(base)).build());
      await seedGame(repo, new GameBuilder().withId(middle).withCreatedAt(new Date(base + 1000)).build());
      await seedGame(repo, new GameBuilder().withId(newest).withCreatedAt(new Date(base + 2000)).build());

      // El adaptador Mongo comparte base: se comparan solo las partidas de esta suite.
      const ids = (await repo.listAll())
        .map((game) => game.id)
        .filter((id) => id.startsWith(GAME_CODE_PREFIX));

      expect(ids.indexOf(newest)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(newest)).toBeLessThan(ids.indexOf(middle));
      expect(ids.indexOf(middle)).toBeLessThan(ids.indexOf(oldest));
    });

    it("findWaitingCreatedBefore incluye solo waiting anteriores al cutoff", async () => {
      const cutoff = new Date(Date.parse("2026-06-01T00:00:00.000Z"));
      const before = new Date(cutoff.getTime() - 60_000);
      const after = new Date(cutoff.getTime() + 60_000);
      const oldWaiting = nextCode();
      const recentWaiting = nextCode();
      const oldActive = nextCode();
      const oldFinished = nextCode();
      const oldCancelled = nextCode();

      await seedGame(repo, new GameBuilder().withId(oldWaiting).withStatus("waiting").withCreatedAt(before).build());
      await seedGame(repo, new GameBuilder().withId(recentWaiting).withStatus("waiting").withCreatedAt(after).build());
      await seedGame(repo, new GameBuilder().withId(oldActive).withStatus("active").withCreatedAt(before).build());
      await seedGame(repo, new GameBuilder().withId(oldFinished).withStatus("finished").withCreatedAt(before).build());
      await seedGame(repo, new GameBuilder().withId(oldCancelled).withStatus("cancelled").withCreatedAt(before).build());

      const ids = (await repo.findWaitingCreatedBefore(cutoff)).map((game) => game.id);

      expect(ids).toContain(oldWaiting);
      expect(ids).not.toContain(recentWaiting);
      expect(ids).not.toContain(oldActive);
      expect(ids).not.toContain(oldFinished);
      expect(ids).not.toContain(oldCancelled);
    });

    it("findByIdFresh devuelve el juego en hit y null en miss", async () => {
      const code = nextCode();
      await seedGame(repo, new GameBuilder().withId(code).build());

      const found = await repo.findByIdFresh(code);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(code);

      // La semántica de frescura/caché se cubre en el caso Mongo de US-16.
      expect(await repo.findByIdFresh(`${code}-missing`)).toBeNull();
    });

    describe("prune (US-08)", () => {
      const NOW = Date.parse("2026-06-01T00:00:00.000Z");
      const TTL_MS = 60 * 60 * 1000;
      const clock = createFixedClock(NOW);

      const createPruneRepo = (options: RepositoryCacheOptions = {}) =>
        createRepo({ clock, ttlMs: TTL_MS, maxCachedGames: 500, ...options });

      // En Mongo `seedGame` solo crea el doc: hay que poblar además la caché.
      const seedCached = async (target: TRepo, game: Game): Promise<void> => {
        await seedGame(target, game);
        target.cacheGame?.(game);
      };

      it("TTL: poda las finished vencidas y conserva las recientes", async () => {
        const target = await createPruneRepo();
        const expired = [nextCode(), nextCode(), nextCode()];
        const recent = nextCode();

        for (const id of expired) {
          await seedCached(
            target,
            new GameBuilder()
              .withId(id)
              .withStatus("finished")
              .withCreatedAt(new Date(NOW - TTL_MS - 1))
              .build()
          );
        }
        await seedCached(
          target,
          new GameBuilder()
            .withId(recent)
            .withStatus("finished")
            .withCreatedAt(new Date(NOW - 1_000))
            .build()
        );

        expect(await target.prune()).toBe(3);
        for (const id of expired) {
          expect(target.getCached(id)).toBeUndefined();
        }
        expect(target.getCached(recent)).toBeDefined();
      });

      it("no poda partidas active/waiting antiguas", async () => {
        const target = await createPruneRepo();
        const active = nextCode();
        const waiting = nextCode();
        const staleAt = new Date(NOW - TTL_MS - 60_000);

        await seedCached(
          target,
          new GameBuilder().withId(active).withStatus("active").withCreatedAt(staleAt).build()
        );
        await seedCached(
          target,
          new GameBuilder().withId(waiting).withStatus("waiting").withCreatedAt(staleAt).build()
        );

        expect(await target.prune()).toBe(0);
        expect(target.getCached(active)).toBeDefined();
        expect(target.getCached(waiting)).toBeDefined();
      });

      it("tope: con maxCachedGames 2 evicta las finalizadas más antiguas", async () => {
        const target = await createPruneRepo({ maxCachedGames: 2 });
        const ids = [nextCode(), nextCode(), nextCode(), nextCode(), nextCode()];

        for (const [index, id] of ids.entries()) {
          await seedCached(
            target,
            new GameBuilder()
              .withId(id)
              .withStatus("finished")
              .withCreatedAt(new Date(NOW - (ids.length - index) * 1_000))
              .build()
          );
        }

        expect(await target.prune()).toBe(3);
        expect(target.getCached(ids[0])).toBeUndefined();
        expect(target.getCached(ids[1])).toBeUndefined();
        expect(target.getCached(ids[2])).toBeUndefined();
        expect(target.getCached(ids[3])).toBeDefined();
        expect(target.getCached(ids[4])).toBeDefined();
      });

      it("idempotencia: el segundo prune devuelve 0", async () => {
        const target = await createPruneRepo();
        await seedCached(
          target,
          new GameBuilder()
            .withId(nextCode())
            .withStatus("cancelled")
            .withCreatedAt(new Date(NOW - TTL_MS - 1))
            .build()
        );

        expect(await target.prune()).toBe(1);
        expect(await target.prune()).toBe(0);
      });
    });
  });
}

async function seedInMemoryGame(repo: InMemoryGameRepository, game: Game): Promise<void> {
  repo.seed(game);
}

async function seedMongoGame(_repo: MongoGameRepository, game: Game): Promise<void> {
  await GameModel.create({
    name: game.name,
    gameCode: game.id,
    questions: game.questions.map((q) => ({
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      image: q.image ?? null,
    })),
    createdAt: game.createdAt,
    creatorId: game.creatorId,
    status: game.status,
    currentQuestionIndex: game.currentQuestionIndex,
    currentQuestionStartTime: game.currentQuestionStartTime,
    questionTimeLimit: game.questionTimeLimit,
    locked: game.locked ?? false,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      gameId: p.gameId,
      answers: { ...p.answers },
      score: p.score,
      joinedAt: p.joinedAt,
      avatar: p.avatar ?? null,
    })),
  });
}

/**
 * Verificación exclusiva de Mongo: lee la partida directo de la DB (`.lean()`)
 * y comprueba la escritura real de `save`, sin pasar por la caché. `save` es
 * state-only (US-19): `players` se cubre con addPlayer/removePlayer/updatePlayers.
 */
async function verifyMongoSaved(game: Game): Promise<void> {
  const doc = await GameModel.findOne({ gameCode: game.id }).lean<GameDoc | null>();
  expect(doc).not.toBeNull();

  expect(doc!.name).toBe(game.name);
  expect(doc!.status).toBe(game.status);
  expect(doc!.currentQuestionIndex).toBe(game.currentQuestionIndex);
  expect(doc!.currentQuestionStartTime).toBe(game.currentQuestionStartTime);
  expect(doc!.questionTimeLimit).toBe(game.questionTimeLimit);
  expect(doc!.locked).toBe(game.locked ?? false);
}

describe("InMemoryGameRepository", () => {
  repositoryContractTests("in-memory", createInMemoryGameRepository, seedInMemoryGame);
});

describe.skipIf(!process.env.MONGODB_URI_TEST)("MongoGameRepository", () => {
  beforeAll(async () => {
    await connectToMongo(process.env.MONGODB_URI_TEST!);
  });

  afterAll(async () => {
    await GameModel.deleteMany({ gameCode: { $regex: `^${GAME_CODE_PREFIX}-` } });
    await mongoose.disconnect();
  });

  repositoryContractTests("mongo", createMongoGameRepository, seedMongoGame, verifyMongoSaved);

  it("findByIdFresh (US-16) ve la escritura externa, refresca la caché y no altera el cache-first de findById", async () => {
    const code = `ws05-fresh-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const repo = createMongoGameRepository();
    await seedMongoGame(repo, new GameBuilder().withId(code).withStatus("waiting").build());

    // El admin carga la partida: `findById` cachea la copia con 0 jugadores.
    expect((await repo.findById(code))!.players).toHaveLength(0);

    // Join externo (otro proceso, p. ej. POST /api/games/join de Next): escribe
    // directo en Mongo sin pasar por la caché de este adaptador.
    const externalPlayer = {
      id: `${code}-ext`,
      name: "Externo",
      gameId: code,
      answers: {},
      score: 0,
      joinedAt: new Date(),
    };
    await GameModel.updateOne({ gameCode: code }, { $push: { players: externalPlayer } });

    // Cache-first intacto: `findById` sigue devolviendo la copia stale.
    expect((await repo.findById(code))!.players).toHaveLength(0);

    // Lectura fresca: ve al jugador externo y refresca la caché.
    const fresh = await repo.findByIdFresh(code);
    expect(fresh!.players).toHaveLength(1);
    expect(fresh!.players[0]).toMatchObject({
      id: externalPlayer.id,
      name: "Externo",
      score: 0,
      answers: {},
    });
    expect(repo.getCached(code)!.players).toHaveLength(1);

    // Miss: no cachea negativos.
    expect(await repo.findByIdFresh(`${code}-missing`)).toBeNull();
    expect(repo.getCached(`${code}-missing`)).toBeUndefined();
  });
});
