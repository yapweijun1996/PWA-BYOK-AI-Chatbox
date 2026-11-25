import type { DeviceCipher } from "./types";
const encode = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const decode = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
/** The non-extractable device key is stored with the ciphertext in IndexedDB. */
export async function encryptDeviceSecret(secret: string): Promise<DeviceCipher> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  return { version: 2, iv: encode(iv), data: encode(new Uint8Array(data)), key };
}
export async function decryptDeviceSecret(cipher: DeviceCipher): Promise<string> {
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(cipher.iv) as BufferSource }, cipher.key, decode(cipher.data) as BufferSource);
  return new TextDecoder().decode(data);
}
