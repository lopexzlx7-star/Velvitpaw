const MIN_DURATION_S = 3 * 60; // 3 minutes
const MIN_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const POST_COMPRESS_MAX_BYTES = 200 * 1024 * 1024; // bail-out guard after compression

export function shouldCompress(file: File, durationSeconds: number): boolean {
  return durationSeconds > MIN_DURATION_S && file.size > MIN_SIZE_BYTES;
}

// Sends the video to the server proxy which forwards to ApyHub for compression.
// Returns a compressed File, or throws on failure.
export async function compressVideoViaApyHub(file: File): Promise<File> {
  const fd = new FormData();
  fd.append('video', file, file.name);

  const res = await fetch('/api/compress-video', {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? msg; } catch {}
    throw new Error(msg);
  }

  const blob = await res.blob();
  const outName = file.name.replace(/\.[^.]+$/, '.mp4');
  return new File([blob], outName, { type: 'video/mp4' });
}
