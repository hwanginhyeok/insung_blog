/**
 * 쿠키 암호화 유틸 (TypeScript/서버사이드).
 *
 * Node.js crypto 모듈로 AES-256-CBC 암호화.
 * Python 측 Fernet과는 별도 구현이지만, 동일한 키에서 파생.
 *
 * 저장 형식: { encrypted: true, data: "iv:ciphertext" } (base64)
 * Python Fernet과 호환을 위해 Python 측에서 읽기/쓰기 모두 처리.
 * TS는 암호화만 하고, 복호화는 Python에서만 수행.
 *
 * 단순화: TS에서도 Fernet 호환 포맷으로 암호화.
 * → 실제로는 Python이 모든 읽기를 처리하므로,
 *   TS에서는 JSON.stringify 후 base64 인코딩 + 래핑만 수행.
 *   Python이 복호화를 담당.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const raw = process.env.COOKIE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("COOKIE_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다");
  }
  // Fernet 키는 base64로 인코딩된 32바이트 (실제로는 signing key 16 + encryption key 16)
  // 여기서는 별도 AES-256 키로 사용: SHA-256 해시
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptCookies(cookies: Record<string, unknown>[]): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const json = JSON.stringify(cookies);
  let encrypted = cipher.update(json, "utf8", "base64");
  encrypted += cipher.final("base64");

  const payload = iv.toString("base64") + ":" + encrypted;

  return JSON.stringify({
    encrypted: true,
    format: "aes-256-cbc",
    data: payload,
  });
}

export function decryptCookies(
  cookieData: unknown
): Record<string, unknown>[] {
  // 평문 배열이면 그대로 반환 (하위 호환)
  if (Array.isArray(cookieData)) {
    return cookieData;
  }

  if (
    typeof cookieData === "object" &&
    cookieData !== null &&
    "encrypted" in cookieData
  ) {
    const obj = cookieData as { encrypted: boolean; format?: string; data: string };

    if (obj.format === "aes-256-cbc") {
      // TS에서 암호화한 것 복호화
      const key = getKey();
      const [ivB64, cipherB64] = obj.data.split(":");
      const iv = Buffer.from(ivB64, "base64");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(cipherB64, "base64", "utf8");
      decrypted += decipher.final("utf8");
      return JSON.parse(decrypted);
    }

    // Python Fernet으로 암호화된 것은 여기서 복호화 불가
    // → 쿠키 개수만 필요하므로 0 반환
    return [];
  }

  return [];
}

export function isEncrypted(cookieData: unknown): boolean {
  if (
    typeof cookieData === "object" &&
    cookieData !== null &&
    "encrypted" in cookieData
  ) {
    return (cookieData as { encrypted: boolean }).encrypted === true;
  }
  return false;
}
