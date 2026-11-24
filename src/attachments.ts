import { id } from "./types";
import type { Attachment } from "./types";

const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

async function readImage(file: File, mime: string): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const header = new TextDecoder().decode(bytes);
  const matchesMime =
    mime === "image/png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every(
          (byte, index) => bytes[index] === byte,
        )
      : mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === "image/gif"
          ? /^GIF8[79]a/.test(header)
          : header.startsWith("RIFF") &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const unreadable = `${file.name}: this image could not be read.`;
  if (!matchesMime) throw new Error(unreadable);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(unreadable));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = data;
  await image.decode().catch(() => {
    throw new Error(unreadable);
  });
  return data;
}

export async function readAttachment(file: File): Promise<Attachment> {
  const mime =
    file.type === "application/json" ||
    (!file.type && /\.(txt|md|csv|json)$/i.test(file.name))
      ? "text/plain"
      : file.type;
  const isText = mime.startsWith("text/");
  if (!isText && !imageTypes.includes(mime))
    throw new Error(`${file.name}: use an image or plain text file.`);
  if (file.size > 5 * 1024 * 1024)
    throw new Error(`${file.name}: files must be 5 MB or smaller.`);
  const data = isText ? await file.text() : await readImage(file, mime);
  return { id: id(), name: file.name, mime, size: file.size, data };
}
