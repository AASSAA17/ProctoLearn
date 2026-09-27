import { BadRequestException } from '@nestjs/common';
import { open } from 'fs/promises';

export async function recordingFormat(path: string, mime: string) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead >= 12) {
      if (['video/webm', 'video/x-matroska'].includes(mime) && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
        return { extension: mime === 'video/webm' ? 'webm' : 'mkv', mime };
      }
      if (mime === 'video/mp4' && header.toString('ascii', 4, 8) === 'ftyp') return { extension: 'mp4', mime };
      if (mime === 'video/ogg' && header.toString('ascii', 0, 4) === 'OggS') return { extension: 'ogv', mime };
    }
    throw new BadRequestException('Видео файлы жарамсыз');
  } finally {
    await file.close();
  }
}
