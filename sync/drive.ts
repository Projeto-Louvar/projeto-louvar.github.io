import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { google, type drive_v3 } from 'googleapis';
import { isAudioFile } from './titles';
import type { DriveAudio, DriveFolder, DriveSnapshot, SkippedFile } from './tree';

const FOLDER = 'application/vnd.google-apps.folder';
const META_TIMEOUT_MS = 120_000;
const MEDIA_TIMEOUT_MS = 900_000;

export function createDrive(saJson: string): drive_v3.Drive {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function snapshotDrive(drive: drive_v3.Drive, rootId: string): Promise<DriveSnapshot> {
  const root = await drive.files.get(
    { fileId: rootId, fields: 'id,name', supportsAllDrives: true },
    { timeout: META_TIMEOUT_MS },
  );
  const folders: DriveFolder[] = [{ id: rootId, name: root.data.name ?? 'Louvores', parentId: null }];
  const files: DriveAudio[] = [];
  const skipped: string[] = [];
  const skippedFiles: SkippedFile[] = [];
  const queue = [rootId];

  while (queue.length) {
    const parent = queue.shift()!;
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list(
        {
          q: `'${parent}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id,name,mimeType,md5Checksum,size)',
          pageSize: 1000,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
        { timeout: META_TIMEOUT_MS },
      );
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name) continue;
        if (f.mimeType === FOLDER) {
          folders.push({ id: f.id, name: f.name, parentId: parent });
          queue.push(f.id);
        } else if (isAudioFile(f.name) && f.md5Checksum) {
          files.push({ id: f.id, name: f.name, parentId: parent, md5: f.md5Checksum, size: Number(f.size ?? 0) });
        } else {
          skipped.push(f.name);
          skippedFiles.push({ name: f.name, parentId: parent, mimeType: f.mimeType ?? '' });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return { rootId, folders, files, skipped, skippedFiles };
}

export async function downloadToFile(drive: drive_v3.Drive, fileId: string, dest: string): Promise<void> {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream', timeout: MEDIA_TIMEOUT_MS },
  );
  await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(dest));
}
