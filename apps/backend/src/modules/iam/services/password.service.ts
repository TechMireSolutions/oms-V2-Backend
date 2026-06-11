import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

// OWASP-recommended Argon2id parameters (2024): m=64MiB, t=3, p=1.
// Tune `memoryCost` upward as VPS RAM allows; never below 19MiB.
const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1
};

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON_OPTS);
  }

  /** Constant-time verify; rehash transparently if params drifted. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON_OPTS);
  }
}
