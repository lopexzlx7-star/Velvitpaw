import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.6';
const CDN = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let _ffmpeg: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg?.loaded) return _ffmpeg;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    _ffmpeg = ff;
    return ff;
  })();
  return _loadPromise;
}

export const POST_COMPRESS_MAX_BYTES = 100 * 1024 * 1024;

export async function compressVideo(
  file: File,
  onLoadProgress: (pct: number) => void,
  onEncodeProgress: (pct: number) => void,
): Promise<File> {
  onLoadProgress(0);
  const ff = await getFFmpeg();
  onLoadProgress(100);

  const progressHandler = ({ progress }: { progress: number }) => {
    onEncodeProgress(Math.min(99, Math.round(progress * 100)));
  };
  ff.on('progress', progressHandler);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `in_${Date.now()}.${ext}`;
  const outputName = `out_${Date.now()}.mp4`;

  try {
    await ff.writeFile(inputName, await fetchFile(file));
    await ff.exec([
      '-i', inputName,
      '-vf', "scale='if(gt(iw,1280),1280,iw)':-2",
      '-c:v', 'libx264',
      '-crf', '28',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ]);
    const data = await ff.readFile(outputName);
    const blob = new Blob([data as Uint8Array], { type: 'video/mp4' });
    const newName = file.name.replace(/\.[^.]+$/, '.mp4');
    onEncodeProgress(100);
    return new File([blob], newName, { type: 'video/mp4' });
  } finally {
    ff.off('progress', progressHandler);
    ff.deleteFile(inputName).catch(() => {});
    ff.deleteFile(outputName).catch(() => {});
  }
}
