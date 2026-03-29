import type { VaultStore } from '../tokenizer/vault.ts';

export function createStreamTransformer(_vault: VaultStore): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream();
}
