import type { Player, PlayerAvatar } from "../../core/domain/player.js";

export class PlayerBuilder {
  private player: Player = {
    id: "player-1",
    name: "Jugador 1",
    gameId: "game-1",
    answers: {},
    score: 0,
    joinedAt: new Date(0),
  };

  withId(id: string): this {
    this.player.id = id;
    return this;
  }

  withName(name: string): this {
    this.player.name = name;
    return this;
  }

  withGameId(gameId: string): this {
    this.player.gameId = gameId;
    return this;
  }

  withAnswers(answers: Record<string, number>): this {
    this.player.answers = answers;
    return this;
  }

  withAnswer(questionId: string, answer: number): this {
    this.player.answers[questionId] = answer;
    return this;
  }

  withScore(score: number): this {
    this.player.score = score;
    return this;
  }

  withJoinedAt(joinedAt: Date): this {
    this.player.joinedAt = joinedAt;
    return this;
  }

  withAvatar(avatar: PlayerAvatar): this {
    this.player.avatar = avatar;
    return this;
  }

  build(): Player {
    return {
      ...this.player,
      answers: { ...this.player.answers },
      joinedAt: new Date(this.player.joinedAt.getTime()),
      avatar: this.player.avatar ? { ...this.player.avatar } : this.player.avatar,
    };
  }
}
