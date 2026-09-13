export interface PlayerAvatar {
  seed: string;
  accessories?: string[];
}

export interface Player {
  id: string;
  name: string;
  gameId: string;
  answers: Record<string, number>; // questionId -> índice elegido
  /** ms transcurridos desde el inicio de la pregunta al responder; `undefined` en partidas legacy. */
  answerTimesMs?: Record<string, number>;
  score: number;
  joinedAt: Date;
  avatar?: PlayerAvatar;
}
