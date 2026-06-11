// @oms/crypto — application-level field encryption for PII at rest.
//
// AES-256-GCM with a versioned, keyed-derivation envelope. The Data
// Encryption Key (DEK) is derived from a master key (KEK) via HKDF, scoped by
// a per-field "context" string so the same plaintext encrypts differently in
// different columns and modules cannot decrypt each other's fields by accident.
//
// On-wire layout (single base64url blob, prefixed for forward-compat):
//   v1.<base64url(ivchars 12B)>.<base64url(tag 16B)>.<base64url(ciphertext)>
//
// This is intentionally provider-agnostic: today the KEK is a secret env var;
// swapping to KMS/Vault means changing only `resolveKek()`.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface FieldCipherOptions {
  /** 32+ byte master key (KEK). Keep in a secret store, never in code. */
  masterKey: string;
  /** Namespacing salt; rotate to force re-encryption of all fields. */
  keyId?: string;
}

export class FieldCipher {
  private readonly kek: Buffer;
  private readonly keyId: string;

  constructor(opts: FieldCipherOptions) {
    if (!opts.masterKey || opts.masterKey.length < 32)
      throw new Error("FieldCipher: masterKey must be at least 32 chars");
    this.kek = Buffer.from(opts.masterKey, "utf8");
    this.keyId = opts.keyId ?? "default";
  }

  /** Derive a per-context DEK so each field/column gets a distinct key. */
  private deriveKey(context: string): Buffer {
    const info = Buffer.from(`oms:fieldcipher:${this.keyId}:${context}`, "utf8");
    return Buffer.from(hkdfSync("sha256", this.kek, Buffer.alloc(0), info, KEY_BYTES));
  }

  /** Encrypt a UTF-8 plaintext bound to `context` (e.g. "welfare.financialBackground"). */
  encrypt(plaintext: string, context: string): string {
    const key = this.deriveKey(context);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, key, iv);
    // Bind the context into the auth tag so a blob can't be moved between columns.
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, b64u(iv), b64u(tag), b64u(ct)].join(".");
  }

  /** Decrypt a blob produced by `encrypt`, verifying it was bound to `context`. */
  decrypt(blob: string, context: string): string {
    const parts = blob.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION)
      throw new Error("FieldCipher: unrecognized ciphertext format");
    const iv = fromB64u(parts[1]!);
    const tag = fromB64u(parts[2]!);
    const ct = fromB64u(parts[3]!);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
      throw new Error("FieldCipher: malformed ciphertext");

    const key = this.deriveKey(context);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }

  /** Encrypt to a Buffer (for `bytea` columns) instead of a string. */
  encryptToBytes(plaintext: string, context: string): Buffer {
    return Buffer.from(this.encrypt(plaintext, context), "utf8");
  }
  decryptFromBytes(buf: Buffer, context: string): string {
    return this.decrypt(buf.toString("utf8"), context);
  }

  /**
   * Deterministic blind index for equality search over encrypted columns
   * (e.g. find an applicant by national ID without decrypting every row).
   * NOT reversible; store alongside the ciphertext in an indexed column.
   */
  blindIndex(value: string, context: string): string {
    const key = this.deriveKey(`bidx:${context}`);
    return b64u(Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), Buffer.from(value, "utf8"), KEY_BYTES)));
  }

  static constantTimeEquals(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}

function b64u(b: Buffer): string { return b.toString("base64url"); }
function fromB64u(s: string): Buffer { return Buffer.from(s, "base64url"); }
