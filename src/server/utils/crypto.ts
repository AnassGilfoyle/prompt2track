import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "prompttracker-default-secret-key-change-me";

// Use SHA-256 to hash the key string into a stable 32-byte buffer required for AES-256
const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

/**
 * Encrypts a plain text string using AES-256-CBC.
 * Returns the result in the format: iv_hex:encrypted_hex
 */
export function encrypt(text: string): string {
  if (!text) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an encrypted string in the format iv_hex:encrypted_hex.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 2) return "";
    const iv = Buffer.from(parts[0]!, "hex");
    const encrypted = parts[1]!;
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return "";
  }
}
