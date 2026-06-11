import { Provider } from "@nestjs/common";
import { FieldCipher } from "@oms/crypto";
import { loadEnv } from "@oms/config";

export const FIELD_CIPHER = Symbol("FIELD_CIPHER");

// Single FieldCipher bound to the PII master key (KEK). Field-specific keys are
// derived per-context internally, so one instance serves all encrypted columns.
export const fieldCipherProvider: Provider = {
  provide: FIELD_CIPHER,
  useFactory: (): FieldCipher => {
    const env = loadEnv();
    return new FieldCipher({ masterKey: env.PII_MASTER_KEY, keyId: env.PII_KEY_ID });
  }
};
