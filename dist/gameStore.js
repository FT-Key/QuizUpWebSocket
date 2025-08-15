import { v4 as uuidv4 } from "uuid";
// In-memory storage
class GameStore {
    games = new Map();
    players = new Map();
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
    submitAnswer(playerId, questionId, answer) {
        const player = this.players.get(playerId);
        if (!player)
            return false;
        const game = this.games.get(player.gameId);
        if (!game)
            return false;
        player.answers[questionId] = answer;
        const question = game.questions.find((q) => q.id === questionId);
        if (question && answer === question.correctAnswer) {
            player.score += 1;
        }
        return true;
    }
    startGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.status = "active";
        return true;
    }
    finishGame(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return false;
        game.status = "finished";
        return true;
    }
    getGameResults(gameId) {
        const game = this.games.get(gameId);
        if (!game)
            return null;
        const leaderboard = game.players.map((p) => ({
            playerId: p.id,
            name: p.name,
            score: p.score,
            correctAnswers: Object.keys(p.answers).filter((qId) => {
                const question = game.questions.find((q) => q.id === qId);
                return question && p.answers[qId] === question.correctAnswer;
            }).length,
            percentage: Object.keys(p.answers).length > 0
                ? (Object.keys(p.answers).filter((qId) => {
                    const question = game.questions.find((q) => q.id === qId);
                    return question && p.answers[qId] === question.correctAnswer;
                }).length /
                    game.questions.length) *
                    100
                : 0,
        }));
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