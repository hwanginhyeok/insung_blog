/**
 * 클라이언트 이미지 압축/리사이즈 — Canvas API 기반
 *
 * 핸드폰 사진 (4000x3000, ~5MB) → 블로그 적합 크기 (max 1920px, ~500KB)
 * Storage 용량 절약 + Vision API 토큰 절감
 */

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const JPEG_QUALITY = 0.8;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 이상만 압축 강제

/**
 * 이미지 File을 리사이즈+압축한 새 File로 반환.
 * 이미 작은 이미지는 그대로 반환.
 */
export async function compressImage(file: File): Promise<File> {
  // GIF/WebP 등은 압축하지 않음 (투명도, 애니메이션 손실 방지)
  if (!file.type.startsWith("image/jpeg") && !file.type.startsWith("image/png")) {
    return file;
  }

  const img = await createImageBitmap(file);
  const { width, height } = img;

  // 이미 충분히 작으면 그대로 반환
  if (width <= MAX_WIDTH && height <= MAX_HEIGHT && file.size < MAX_FILE_SIZE) {
    img.close();
    return file;
  }

  // 비율 유지 리사이즈
  let newWidth = width;
  let newHeight = height;

  if (newWidth > MAX_WIDTH) {
    newHeight = Math.round((newHeight * MAX_WIDTH) / newWidth);
    newWidth = MAX_WIDTH;
  }
  if (newHeight > MAX_HEIGHT) {
    newWidth = Math.round((newWidth * MAX_HEIGHT) / newHeight);
    newHeight = MAX_HEIGHT;
  }

  // Canvas에 그리기
  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    img.close();
    return file;
  }

  ctx.drawImage(img, 0, 0, newWidth, newHeight);
  img.close();

  // JPEG로 압축
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  });

  // 압축 후 더 커졌으면 원본 반환 (드문 경우)
  if (blob.size >= file.size) {
    return file;
  }

  const ext = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${ext}.jpg`, { type: "image/jpeg" });
}
