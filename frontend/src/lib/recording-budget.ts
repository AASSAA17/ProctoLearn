export const RECORDING_LIMIT = 512 * 1024 * 1024;
export const CAMERA_BITS = 250_000;
export const SCREEN_BITS = 500_000;
export const AUDIO_BITS = 32_000;

/** Codec targets are estimates; reserve container/encoder overhead and a small finalization margin. */
export function recordingBudget(seconds: number, uploadedBytes = 0, availableBytes?: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(uploadedBytes) || uploadedBytes < 0) {
    throw new Error('Емтихан ұзақтығын тексеру мүмкін болмады.');
  }
  const estimatedBytes = Math.ceil((seconds + 30) * (CAMERA_BITS + SCREEN_BITS + AUDIO_BITS * 2) / 8 * 1.25) + 8 * 1024 * 1024;
  if (uploadedBytes + estimatedBytes > RECORDING_LIMIT) {
    throw new Error('Емтихан ұзақтығы 512 MiB жазба шегіне сыймайды. Мұғалім ұзақтығын немесе әкімші жазба саясатын өзгертуі керек. Таймер басталған жоқ.');
  }
  if (availableBytes !== undefined && (!Number.isFinite(availableBytes) || availableBytes < estimatedBytes + 32 * 1024 * 1024)) {
    throw new Error('Браузер қоймасында жазбаға жеткілікті орын анықталмады. Орын босатып, қайта көріңіз. Таймер басталған жоқ.');
  }
  return { estimatedBytes, limitBytes: RECORDING_LIMIT };
}
