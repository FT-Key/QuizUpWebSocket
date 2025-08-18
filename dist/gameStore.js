import { v4 as uuidv4 } from "uuid";
import { DEFAULT_TIME_LIMIT_MS } from "./constants/game.js";
class GameStore {
    games = new Map();
    players = new Map();
    questionTimeouts = new Map();
    createGame(data, creatorId) {
        const questions = data.questions.map((q) => ({
            id: uuidv4(),
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
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
    getGame(gameId) {
        return this.games.get(gameId);
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
    /** Registra la respuesta, calcula score y termina pregunta si todos respondieron */
    submitAnswer(playerId, questionId, answer) {
        const player = this.players.get(playerId);
        if (!player)
            return false;
        const game = this.games.get(player.gameId);
        if (!game)
            return false;
        const question = game.questions.find((q) => q.id === questionId);
        if (!question)
            return false;
        // Guardar respuesta
        player.answers[questionId] = answer;
        // Calcular score base
        if (answer === question.correctAnswer) {
            player.score += 1;
            // Bonus por tiempo restante
            const elapsed = Date.now() - game.currentQuestionStartTime;
            const remainingMs = game.questionTimeLimit - elapsed;
            const remainingSeconds = Math.floor(remainingMs / 1000);
            if (remainingSeconds > 0) {
                player.score += remainingSeconds;
            }
        }
        // Verificar si todos respondieron → terminar pregunta automáticamente
        const allAnswered = game.players.every((p) => p.answers[questionId] !== undefined);
        if (allAnswered) {
            this.finishCurrentQuestion(game.id);
            return { finishedQuestion: true };
        }
        return { finishedQuestion: false };
    }
    /** Comienza el juego y lanza primer timeout */
    startGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.status = "active";
        game.currentQuestionIndex = 0;
        game.currentQuestionStartTime = Date.now();
        this.setQuestionTimeout(gameId);
        return true;
    }
    nextQuestion(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        this.clearQuestionTimeout(gameId);
        if (game.currentQuestionIndex + 1 < game.questions.length) {
            game.currentQuestionIndex += 1;
            game.currentQuestionStartTime = Date.now();
            this.setQuestionTimeout(gameId);
            return true;
        }
        else {
            this.finishGame(gameId);
            return false;
        }
    }
    /** Fin manual o automático de la pregunta actual */
    finishCurrentQuestion(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        // Limpiar timeout
        this.clearQuestionTimeout(gameId);
        // Marcar pregunta como terminada
        game.currentQuestionStartTime = 0;
        return true;
    }
    finishGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        this.clearQuestionTimeout(gameId);
        game.status = "finished";
        return true;
    }
    setQuestionTimeout(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return;
        const timeout = setTimeout(() => {
            this.finishCurrentQuestion(gameId);
            // ⚠️ Emisión de "question-finished" se hace desde socket-server
        }, game.questionTimeLimit);
        this.questionTimeouts.set(gameId, timeout);
    }
    clearQuestionTimeout(gameId) {
        const existing = this.questionTimeouts.get(gameId);
        if (existing) {
            clearTimeout(existing);
            this.questionTimeouts.delete(gameId);
        }
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
                percentage: game.questions.length > 0
                    ? (correctAnswers / game.questions.length) * 100
                    : 0,
            };
        });
        return {
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