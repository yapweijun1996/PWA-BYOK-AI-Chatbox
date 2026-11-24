import type { Cipher } from "./types";
const encode = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const decode = (data: string) =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
async function key(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptSecret(
  secret: string,
  password: string,
): Promise<Cipher> {
  if (!password) throw new Error("Enter an unlock password.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600000;
  const derived = await key(password, salt, iterations);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derived,
    new TextEncoder().encode(secret),
  );
  return {
    version: 1,
    salt: encode(salt),
    iv: encode(iv),
    data: encode(new Uint8Array(data)),
    iterations,
  };
}
export async function decryptSecret(
  cipher: Cipher,
  password: string,
): Promise<string> {
  if (
    cipher.version !== 1 ||
    cipher.iterations < 100000 ||
    cipher.iterations > 2000000
  )
    throw new Error("Unsupported encrypted key format.");
  try {
    const derived = await key(password, decode(cipher.salt), cipher.iterations);
    const result = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(cipher.iv) as BufferSource },
      derived,
      decode(cipher.data) as BufferSource,
    );
    return new TextDecoder().decode(result);
  } catch {
    throw new Error("Could not unlock key. Check your password.");
  }
}
