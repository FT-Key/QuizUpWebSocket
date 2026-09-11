export interface PlayerAvatar {
  seed: string;
  accessories?: string[];
}

export interface Player {
  id: string;
  name: string;
  gameId: string;
  answers: Record<string, number>; // questionId -> índice elegido
  score: number;
  joinedAt: Date;
  avatar?: PlayerAvatar;
}
