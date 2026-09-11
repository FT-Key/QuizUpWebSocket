import { v4 as uuidv4 } from "uuid";
import { DEFAULT_TIME_LIMIT_MS } from "./constants/game.js";
class GameStore {
    games = new Map();
    players = new Map();
    createGame(data, creatorId) {
        const questions = data.questions.map((q) => ({
            id: uuidv4(),
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
            image: q.image ?? null,
        }));
        const game = {
            id: uuidv4(),
            name: data.name,
            questions,
            createdAt: new Date(),
            creatorId,
            status: "waiting",
            currentQuestionIndex: 0,
            players: [],
            currentQuestionStartTime: 0,
            questionTimeLimit: DEFAULT_TIME_LIMIT_MS,
        };
        this.games.set(game.id, game);
        return game;
    }
    addGameFromDb(game) {
        this.games.set(game.id, game);
    }
    getGame(gameId) {
        return this.games.get(gameId);
    }
    removePlayer(gameId, playerId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.players = game.players.filter((p) => p.id !== playerId);
        this.players.delete(playerId);
        return true;
    }
    addPlayer(gameId, playerName) {
        const game = this.games.get(gameId);
        if (!game)
            return null;
        const player = {
            id: uuidv4(),
            name: playerName,
            gameId,
            answers: {},
            score: 0,
            joinedAt: new Date(),
        };
        this.players.set(player.id, player);
        game.players.push(player);
        return player;
    }
    submitAnswer(playerId, questionId, answer) {
        let player;
        let game;
        for (const g of this.games.values()) {
            const found = g.players.find((p) => p.id === playerId);
            if (found) {
                player = found;
                game = g;
                break;
            }
        }
        if (!player || !game)
            return false;
        const question = game.questions.find((q) => q.id === questionId);
        if (!question)
            return false;
        player.answers[questionId] = answer;
        if (answer === question.correctAnswer) {
            player.score += 1;
            const elapsed = Date.now() - game.currentQuestionStartTime;
            const remainingMs = game.questionTimeLimit - elapsed;
            if (remainingMs > 0) {
                player.score += Math.floor(remainingMs / 10);
            }
        }
        const allAnswered = game.players.every((p) => p.answers[questionId] !== undefined);
        if (allAnswered) {
            this.finishCurrentQuestion(game.id);
            return { finishedQuestion: true };
        }
        return { finishedQuestion: false };
    }
    startGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.status = "active";
        game.currentQuestionIndex = 0;
        game.currentQuestionStartTime = Date.now();
        return true;
    }
    nextQuestion(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        if (game.currentQuestionIndex + 1 < game.questions.length) {
            game.currentQuestionIndex += 1;
            game.currentQuestionStartTime = Date.now();
            return true;
        }
        else {
            this.finishGame(gameId);
            return false;
        }
    }
    finishCurrentQuestion(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.currentQuestionStartTime = 0;
        return true;
    }
    finishGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.status = "finished";
        return true;
    }
    cancelGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        if (game.status !== "waiting")
            return false;
        game.status = "cancelled";
        return true;
    }
    getGameResults(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return null;
        const leaderboard = game.players.map((p) => {
            const correctAnswers = Object.keys(p.answers).filter((qId) => {
                const question = game.questions.find((q) => q.id === qId);
                return question && p.answers[qId] === question.correctAnswer;
            }).length;
            return {
                playerId: p.id,
                name: p.name,
                score: p.score,
                correctAnswers,
                totalQuestions: game.questions.length,
                percentage: game.questions.length > 0
                    ? (correctAnswers / game.questions.length) * 100
                    : 0,
                avatar: p.avatar,
            };
        });
        return {
            gameId: game.id,
            createdAt: game.createdAt,
            totalPlayers: game.players.length,
            totalQuestions: game.questions.length,
            leaderboard,
        };
    }
    getAllGames() {
        return Array.from(this.games.values());
    }
}
export const gameStore = new GameStore();
//# sourceMappingURL=gameStore.js.map