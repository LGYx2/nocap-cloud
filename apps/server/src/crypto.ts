import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "./http";

/** Encrypts secrets (environment variable values) with AES-256-GCM before they reach the database. */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(`nocap-env:${secret}`).digest();
  }

  /** `v1.` + base64url(iv | tag | ciphertext). The prefix leaves room for key rotation later. */
  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
  }

  open(sealed: string): string {
    if (!sealed.startsWith("v1.")) throw new Error("Unknown secret format");
    const raw = Buffer.from(sealed.slice(3), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }
}

/** The SecretBox for this install, or a clear error when NOCAP_SECRET is not set. */
export function secretBox(secret: string | undefined): SecretBox {
  if (!secret) {
    throw new HttpError(
      503,
      "Set NOCAP_SECRET (32+ characters) on the server to store environment variables.",
    );
  }
  return new SecretBox(secret);
}
