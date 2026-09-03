import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { config } from "../lib/config.js";
import { userRepository } from "./user/user.repository.js";
import { badRequest } from "../lib/errors.js";

/** Avatar thumbnails are square & small so they're cheap everywhere. */
const AVATAR_SIZE = 256;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

/** Public URL prefix under which avatars are served. */
const PUBLIC_PREFIX = "/upload/profiles/";

function profilesDir() {
  return path.join(config.UPLOAD_DIR, "profiles");
}

/**
 * Decode a base64 image, resize it to a small square PNG thumbnail and
 * store it under `UPLOAD_DIR/profiles/<uuid>.png`. Replaces any previous
 * upload-hosted avatar and returns its public URL.
 */
export async function setAvatar(
  userId: string,
  base64: string,
): Promise<string> {
  const data = Buffer.from(base64 ?? "", "base64");
  if (data.length === 0) throw badRequest("No image data provided");
  if (data.length > MAX_BYTES) throw badRequest("Image is too large");

  let format: string | undefined;
  try {
    format = (await sharp(data).metadata()).format;
  } catch {
    throw badRequest("The uploaded file is not a readable image");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw badRequest("Only PNG, JPEG or WebP images are allowed");
  }

  const dir = profilesDir();
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  await sharp(data)
    .rotate() // respect EXIF orientation
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .png()
    .toFile(path.join(dir, filename));

  const previous = await userRepository.findImage(userId);
  await userRepository.updateImage(userId, `${PUBLIC_PREFIX}${filename}`);
  if (previous?.image) {
    await deleteUploadedAvatar(previous.image).catch(() => {});
  }
  return `${PUBLIC_PREFIX}${filename}`;
}

/** Delete the upload-hosted avatar and clear the user's image field. */
export async function clearAvatar(userId: string): Promise<void> {
  const previous = await userRepository.findImage(userId);
  await userRepository.updateImage(userId, null);
  if (previous?.image) {
    await deleteUploadedAvatar(previous.image).catch(() => {});
  }
}

/** Best-effort removal of an old avatar file (only files we own). */
async function deleteUploadedAvatar(url: string) {
  if (!url.startsWith(PUBLIC_PREFIX)) return;
  const name = url.slice(PUBLIC_PREFIX.length);
  // Only touch files with the exact uuid.png shape we generate.
  if (!/^[0-9a-fA-F-]{36}\.png$/.test(name)) return;
  await rm(path.join(profilesDir(), name), { force: true });
}
