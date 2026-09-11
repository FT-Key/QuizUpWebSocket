import { describe, expect, it } from "vitest";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createJoinAdminRoomUseCase } from "./join-admin-room.js";

describe("JoinAdminRoom", () => {
  it("mete al socket en la sala de admins de la partida", async () => {
    const gateway = createRecordingGateway();
    const useCase = createJoinAdminRoomUseCase({ gateway });

    await useCase.execute({ gameId: "123456", socketId: "s-9" });

    expect(gateway.emissions).toEqual([
      { kind: "joinAdminRoom", socketId: "s-9", gameId: "123456" },
    ]);
  });
});
