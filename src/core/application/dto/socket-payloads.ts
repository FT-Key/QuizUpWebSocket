import { z } from "zod";

/**
 * Schemas Zod de los 12 eventos cliente→servidor del contrato v1.0.0
 * (`docs/03-CONTRACTS.md` §2.1). Solo tipos y opcionalidad del contrato:
 * sin rangos ni reglas de negocio (eso vive en los casos de uso/dominio).
 */

export const playerAvatarPayload = z.object({
  seed: z.string(),
  accessories: z.array(z.string()).optional(),
});

export const joinGameSchema = z.object({
  gameId: z.string(),
  // `nullish`: el cliente emite `playerId: null` en el primer join
  // (`localStorage.getItem("playerId")` → null). Null = ausente = alta nueva.
  playerId: z.string().nullish(),
  playerName: z.string().optional(),
  avatar: playerAvatarPayload.optional(),
});

/** `join-admin` recibe el `gameId` pelado (contrato §2.1 y uso real del cliente). */
export const joinAdminSchema = z.string();

/** Forma compartida por los eventos que solo llevan `{ gameId }`. */
export const gameIdSchema = z.object({ gameId: z.string() });

export const startGameSchema = gameIdSchema;
export const nextQuestionSchema = gameIdSchema;
export const finishQuestionSchema = gameIdSchema;
export const finishGameSchema = gameIdSchema;
export const closeGameSchema = gameIdSchema;
export const requestGameStateSchema = gameIdSchema;

export const submitAnswerSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  questionId: z.string(),
  answer: z.number(),
});

export const leaveGameSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
});

export const lockGameSchema = z.object({
  gameId: z.string(),
  locked: z.boolean(),
});

/**
 * `request-dashboard` no lleva payload. El helper `emit(event, data?)` del
 * cliente siempre pasa un segundo argumento (`socket.emit(event, undefined)`),
 * que Socket.IO serializa como `null`; se toleran ambos.
 */
export const noPayloadSchema = z.union([z.undefined(), z.null()]);
export const requestDashboardSchema = noPayloadSchema;

export type PlayerAvatarPayload = z.infer<typeof playerAvatarPayload>;
export type JoinGamePayload = z.infer<typeof joinGameSchema>;
export type JoinAdminPayload = z.infer<typeof joinAdminSchema>;
export type StartGamePayload = z.infer<typeof startGameSchema>;
export type NextQuestionPayload = z.infer<typeof nextQuestionSchema>;
export type FinishQuestionPayload = z.infer<typeof finishQuestionSchema>;
export type FinishGamePayload = z.infer<typeof finishGameSchema>;
export type CloseGamePayload = z.infer<typeof closeGameSchema>;
export type RequestGameStatePayload = z.infer<typeof requestGameStateSchema>;
export type SubmitAnswerPayload = z.infer<typeof submitAnswerSchema>;
export type LeaveGamePayload = z.infer<typeof leaveGameSchema>;
export type LockGamePayload = z.infer<typeof lockGameSchema>;
export type RequestDashboardPayload = z.infer<typeof requestDashboardSchema>;
