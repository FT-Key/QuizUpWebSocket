import mongoose from "mongoose";

let isConnected = false;

/**
 * Conexión Mongo del adaptador de persistencia.
 * Equivale a `src/mongoose.ts` (que permanece intacto hasta US-05/07 como única
 * conexión en runtime): misma semántica, pero la URI entra por parámetro.
 * Llamar una sola vez desde el bootstrap.
 */
export async function connectToMongo(mongoUri: string): Promise<void> {
  if (isConnected) return;
  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUri);
  isConnected = true;
}
