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
import { GameModel } from "../../adapters/persistence/mongo/game.schema.js";
import { answersToRecord } from "../../adapters/persistence/mongo/game.mapper.js";
import {
  createInMemoryGameRepository,
  type InMemoryGameRepository,
} from "../fakes/in-memory-game-repository.js";
import { GameBuilder } from "../builders/game-builder.js";
import { PlayerBuilder } from "../builders/player-builder.js";

type VerifySaved = (game: Game) => Promise<void>;

const GAME_CODE_PREFIX = "ws05";

function repositoryContractTests<TRepo extends GameRepository>(
  label: string,
  createRepo: () => Promise<TRepo> | TRepo,
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

    it("save hace visible status, índices, locked y players en el siguiente findById", async () => {
      const code = nextCode();
      await seedGame(repo, new GameBuilder().withId(code).withStatus("waiting").build());

      const updated = new GameBuilder()
        .withId(code)
        .withStatus("active")
        .withCurrentQuestionIndex(2)
        .withCurrentQuestionStartTime(1234)
        .withQuestionTimeLimit(30000)
        .withLocked(true)
        .withPlayers(
          new PlayerBuilder()
            .withId(`${code}-p1`)
            .withGameId(code)
            .withAnswers({ "q-1": 1 })
            .withScore(2001)
            .build()
        )
        .build();
      await repo.save(updated);

      const found = await repo.findById(code);
      expect(found!.status).toBe("active");
      expect(found!.currentQuestionIndex).toBe(2);
      expect(found!.currentQuestionStartTime).toBe(1234);
      expect(found!.questionTimeLimit).toBe(30000);
      expect(found!.locked).toBe(true);
      expect(found!.players).toHaveLength(1);
      expect(found!.players[0].id).toBe(`${code}-p1`);
      expect(found!.players[0].answers).toEqual({ "q-1": 1 });
      expect(found!.players[0].score).toBe(2001);

      // Solo la variante Mongo: `findById` puede resolver de la caché que `save`
      // refresca, así que se verifica además la escritura real en la DB.
      if (verifySaved) await verifySaved(updated);
    });

    it("persistPlayers persiste answers y score de ambos jugadores sin pisarse", async () => {
      const code = nextCode();
      const ana = new PlayerBuilder()
        .withId(`${code}-ana`)
        .withGameId(code)
        .withAnswers({ "q-1": 0 })
        .withScore(1)
        .build();
      const luis = new PlayerBuilder()
        .withId(`${code}-luis`)
        .withGameId(code)
        .withAnswers({})
        .withScore(0)
        .build();
      await seedGame(repo, new GameBuilder().withId(code).withPlayers(ana, luis).build());

      await repo.persistPlayers(code, [
        { ...ana, answers: { "q-1": 1 }, score: 2001 },
        { ...luis, answers: { "q-1": 1, "q-2": 0 }, score: 1 },
      ]);

      const found = await repo.findById(code);
      const foundAna = found!.players.find((p) => p.id === `${code}-ana`);
      const foundLuis = found!.players.find((p) => p.id === `${code}-luis`);
      expect(foundAna!.answers).toEqual({ "q-1": 1 });
      expect(foundAna!.score).toBe(2001);
      expect(foundLuis!.answers).toEqual({ "q-1": 1, "q-2": 0 });
      expect(foundLuis!.score).toBe(1);
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

    it("prune devuelve 0 (stub de US-05)", async () => {
      expect(await repo.prune()).toBe(0);
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
 * y comprueba la escritura real de `save`, sin pasar por la caché.
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
  expect(doc!.players).toHaveLength(game.players.length);

  game.players.forEach((player, index) => {
    const persisted = doc!.players[index];
    expect(persisted.id).toBe(player.id);
    expect(persisted.gameId).toBe(game.id);
    expect(answersToRecord(persisted.answers)).toEqual(player.answers);
    expect(persisted.score).toBe(player.score);
  });
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
});
