// The photo store (item 15): every pool photo becomes three files under places/<slug>/photos/,
//   <id>.orig.jpg   the original bytes (re-encoded to JPEG only when the source was not one)
//   <id>-1600.webp  the web size the Skeleton shows
//   <id>-800.webp   the thumb, also what the curation call looks at
// With R2_BUCKET set the three files are uploaded to Cloudflare R2 under <slug>/<file> and the pool carries public
// URLs (R2_PUBLIC_URL/<key>); an object whose size already matches is not uploaded again. Without R2 the URLs are
// relative "photos/<file>" and the build step copies the folder (docs/handoff/S2.md).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { photosDir } from '../paths.mjs';

export const SIZES = { web: 1600, thumb: 800 };

export const fileNames = (id) => ({ orig: `${id}.orig.jpg`, web: `${id}-${SIZES.web}.webp`, thumb: `${id}-${SIZES.thumb}.webp` });
export const r2Key = (slug, file) => `${slug}/${file}`;
export const localUrl = (file) => `photos/${file}`;
export const publicUrl = (base, key) => `${String(base).replace(/\/+$/, '')}/${key}`;
export const localPath = (slug, file) => path.join(photosDir(slug), file);

// The R2 settings from the environment, or null when R2_BUCKET is unset (local store). Throws when the bucket is set
// but the rest is missing, so a half-filled .env is a loud failure rather than a silent local run. R2_ENDPOINT is for
// tests only: it points the client at a mock S3 server (path-style, since the mock has no bucket subdomains).
export function r2Config(env = process.env) {
  if (!env.R2_BUCKET) return null;
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'].filter(k => !env[k]);
  if (missing.length) throw new Error(`R2_BUCKET is set but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing in .env`);
  return {
    bucket: env.R2_BUCKET, accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY, publicUrl: env.R2_PUBLIC_URL,
    endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(env.R2_ENDPOINT),
  };
}

export const orientationOf = (width, height) => {
  if (!width || !height) return 'landscape';
  const r = width / height;
  return r > 1.05 ? 'landscape' : r < 0.95 ? 'portrait' : 'square';
};

// Writes the original for `id` when it is not on disk yet. Non-JPEG sources (PNG, WebP, HEIC) are re-encoded to JPEG
// at high quality so the file name stays honest. Returns the file path.
export async function saveOriginal(slug, id, buffer, type = 'image/jpeg') {
  const file = localPath(slug, fileNames(id).orig);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return file;
  const bytes = type === 'image/jpeg' ? buffer : await sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer();
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
  return file;
}

export const hasOriginal = (slug, id) => fs.existsSync(localPath(slug, fileNames(id).orig));

// Width, height and orientation of the stored original (after EXIF rotation, which is what the resized files get).
export async function measure(slug, id) {
  const m = await sharp(localPath(slug, fileNames(id).orig)).rotate().metadata();
  const w = m.width ?? null, h = m.height ?? null;
  return { width: w, height: h, orientation: orientationOf(w, h) };
}

// Makes the 1600 and 800 wide webp files for `id` when missing (never upscales). Returns how many it wrote.
export async function resize(slug, id) {
  const names = fileNames(id);
  let made = 0;
  const src = localPath(slug, names.orig);
  if (!fs.existsSync(src)) throw new Error(`${src} missing`);
  for (const [k, width] of Object.entries(SIZES)) {
    const out = localPath(slug, names[k]);
    if (fs.existsSync(out)) continue;
    const tmp = `${out}.part`;
    await sharp(src).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(tmp);
    fs.renameSync(tmp, out);
    made++;
  }
  return made;
}

// URL fields for one photo in the local store.
export const localUrls = (id) => {
  const n = fileNames(id);
  return { original: localUrl(n.orig), web: localUrl(n.web), thumb: localUrl(n.thumb) };
};

// URL fields for one photo in R2.
export const r2Urls = (slug, id, publicBase) => {
  const n = fileNames(id);
  return { original: publicUrl(publicBase, r2Key(slug, n.orig)), web: publicUrl(publicBase, r2Key(slug, n.web)), thumb: publicUrl(publicBase, r2Key(slug, n.thumb)) };
};

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.webp': 'image/webp' };

// An S3 client for R2. Loaded lazily so the local store never touches the AWS SDK.
export async function r2Client(cfg) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: 'auto', endpoint: cfg.endpoint, forcePathStyle: cfg.forcePathStyle ?? false,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

// Uploads the three files of `id` unless the object in the bucket already has the same size. Returns the number of
// uploads made. `client` is any object with send(); tests pass a fake.
export async function upload(slug, id, cfg, client, { log = () => {} } = {}) {
  const { HeadObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  let uploaded = 0;
  for (const file of Object.values(fileNames(id))) {
    const local = localPath(slug, file);
    if (!fs.existsSync(local)) throw new Error(`${local} missing, run the store stage first`);
    const size = fs.statSync(local).size;
    const key = r2Key(slug, file);
    let remote = null;
    try { remote = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key })); }
    catch (e) { if (!isNotFound(e)) throw e; }
    if (remote && remote.ContentLength === size) continue;
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket, Key: key, Body: fs.readFileSync(local), ContentType: CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    uploaded++;
    log(`uploaded ${key} (${size} bytes)`);
  }
  return uploaded;
}

const isNotFound = (e) => e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey';
