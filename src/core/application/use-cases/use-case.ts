/** Contrato base de un caso de uso de aplicación (input → output). */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}
