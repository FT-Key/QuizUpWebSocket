import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface EmitDashboardDeps {
  readonly repo: GameRepository;
  readonly gateway: RealtimeGateway;
}

/**
 * `request-dashboard`: recalcula y difunde el dashboard a todos los sockets.
 * Paridad con `helpers.emitDashboard` (listAll ya viene ordenado `createdAt desc`).
 */
export function createEmitDashboardUseCase(deps: EmitDashboardDeps): UseCase<void, void> {
  const { repo, gateway } = deps;

  return {
    async execute() {
      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
