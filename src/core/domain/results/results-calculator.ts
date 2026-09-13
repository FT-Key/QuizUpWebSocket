import type { Game } from "../game.js";
import type { Player, PlayerAvatar } from "../player.js";

export interface GameResults {
  gameId: string;
  createdAt: Date;
  totalPlayers: number;
  totalQuestions: number;
  leaderboard: Array<{
    playerId: string;
    name: string;
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    percentage: number; // 0..100
    avatar?: PlayerAvatar;
    /** US-20: Σ de tiempos por respuesta (preguntas sin dato = `questionTimeLimit`). Ausente en legacy. */
    totalTimeMs?: number;
  }>;
  questionResults?: Array<{
    questionId: string;
    questionText: string;
    correctAnswer: number;
    playerAnswers: Array<{
      playerId: string;
      name: string;
      answer: number; // -1 si no respondió
      isCorrect: boolean;
    }>;
  }>;
  averageScore?: number;
}

export interface ResultsOptions {
  /** Incluye `questionResults`. Default `false` (paridad `gameStore.getGameResults`). */
  readonly includeQuestionResults?: boolean;
  /** Incluye `averageScore`. Default `false` (paridad `gameStore.getGameResults`). */
  readonly includeAverageScore?: boolean;
}

/** Proyección de `Player` con los campos que deciden el orden del leaderboard (US-20). */
export interface RankingInput {
  readonly playerId: string;
  readonly score: number;
  readonly totalTimeMs?: number;
  readonly joinedAt: Date;
}

/**
 * Tiempo total de respuesta del jugador (US-20, D-H2.2): Σ sobre `game.questions`:
 * - `answerTimesMs[q.id]` finito y `>= 0` ⇒ `min(valor, questionTimeLimit)` (el `0` es válido);
 * - en cualquier otro caso (sin responder, sin entrada, valor corrupto) ⇒ `questionTimeLimit` completo.
 * Sin `answerTimesMs` (partida legacy) devuelve `undefined`: la entrada del
 * leaderboard omite `totalTimeMs` y `compareRanking` lo trata como `+Infinity`.
 */
export function totalTimeMsOf(player: Player, game: Game): number | undefined {
  const { answerTimesMs } = player;
  if (!answerTimesMs) return undefined;

  return game.questions.reduce((total, question) => {
    const raw = answerTimesMs[question.id];
    const questionMs =
      typeof raw === "number" && Number.isFinite(raw) && raw >= 0
        ? Math.min(raw, game.questionTimeLimit)
        : game.questionTimeLimit;
    return total + questionMs;
  }, 0);
}

/**
 * Comparador total del leaderboard (US-20, D-H2.3):
 * `score` desc → `totalTimeMs` asc (`undefined` al final) → `joinedAt` asc →
 * `playerId` asc (code units). Nunca devuelve 0 entre jugadores distintos, así
 * que el orden no depende de la estabilidad de `Array.prototype.sort` ni del
 * orden de inserción en `game.players`.
 */
export function compareRanking(a: RankingInput, b: RankingInput): number {
  if (a.score !== b.score) return b.score - a.score;

  const timeA = a.totalTimeMs ?? Number.POSITIVE_INFINITY;
  const timeB = b.totalTimeMs ?? Number.POSITIVE_INFINITY;
  if (timeA !== timeB) return timeA - timeB;

  const joinedDiff = a.joinedAt.getTime() - b.joinedAt.getTime();
  if (joinedDiff !== 0) return joinedDiff;

  if (a.playerId === b.playerId) return 0;
  return a.playerId < b.playerId ? -1 : 1;
}

/**
 * Paridad `gameStore.getGameResults`: percentage crudo, `avatar` siempre como
 * clave y banderas para `questionResults`/`averageScore`. US-20: el
 * `leaderboard` se ordena con `compareRanking` (score desc, desempate por
 * `totalTimeMs`, `joinedAt` y `playerId`); `questionResults` y `averageScore`
 * conservan el orden `game.questions` × `game.players`.
 */
export function calculateResults(game: Game, options: ResultsOptions = {}): GameResults {
  const leaderboard = game.players
    .map((player) => {
      const correctAnswers = Object.keys(player.answers).filter((qId) => {
        const question = game.questions.find((q) => q.id === qId);
        return question !== undefined && player.answers[qId] === question.correctAnswer;
      }).length;

      const totalTimeMs = totalTimeMsOf(player, game);

      return {
        entry: {
          playerId: player.id,
          name: player.name,
          score: player.score,
          correctAnswers,
          totalQuestions: game.questions.length,
          percentage:
            game.questions.length > 0 ? (correctAnswers / game.questions.length) * 100 : 0,
          avatar: player.avatar,
          // Legacy: sin dato de tiempo la clave se OMITE (la UI no inventa tiempos).
          ...(totalTimeMs !== undefined ? { totalTimeMs } : {}),
        },
        rank: {
          playerId: player.id,
          score: player.score,
          totalTimeMs,
          joinedAt: player.joinedAt,
        },
      };
    })
    .sort((a, b) => compareRanking(a.rank, b.rank))
    .map(({ entry }) => entry);

  const results: GameResults = {
    gameId: game.id,
    createdAt: game.createdAt,
    totalPlayers: game.players.length,
    totalQuestions: game.questions.length,
    leaderboard,
  };

  if (options.includeQuestionResults) {
    results.questionResults = game.questions.map((q) => ({
      questionId: q.id,
      questionText: q.text,
      correctAnswer: q.correctAnswer,
      playerAnswers: game.players.map((p) => ({
        playerId: p.id,
        name: p.name,
        answer: p.answers[q.id] ?? -1,
        isCorrect: p.answers[q.id] === q.correctAnswer,
      })),
    }));
  }

  if (options.includeAverageScore) {
    const total = game.players.reduce((sum, p) => sum + p.score, 0);
    results.averageScore = total / (game.players.length || 1);
  }

  return results;
}
