import { SNAPSHOT_V1_LIMITS } from "./v2-types";

export type SafeTextErrorCode = "EMPTY" | "TOO_LONG" | "HTML" | "INSTRUCTION";

export type SafeTextValidationResult =
  | { valid: true; value: string }
  | { valid: false; code: SafeTextErrorCode };

export interface SafeTextOptions {
  maxLength: number;
  allowEmpty?: boolean;
}

const HTML_PATTERN = /<\/?[a-z][^>]*>|javascript\s*:/i;
const INSTRUCTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /(?:^|\s)(?:system|assistant|developer)\s*:/i,
  /```[\s\S]{0,120}(?:system|assistant|developer|instruction|prompt)/i,
] as const;

export function normalizeControlledText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function validateSafeText(
  value: string,
  options: SafeTextOptions
): SafeTextValidationResult {
  const normalized = normalizeControlledText(value);

  if (!normalized && !options.allowEmpty) {
    return { valid: false, code: "EMPTY" };
  }
  if (Array.from(normalized).length > options.maxLength) {
    return { valid: false, code: "TOO_LONG" };
  }
  if (HTML_PATTERN.test(normalized)) {
    return { valid: false, code: "HTML" };
  }
  if (INSTRUCTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { valid: false, code: "INSTRUCTION" };
  }

  return { valid: true, value: normalized };
}

export type SerializedSizeValidationResult =
  | { valid: true; bytes: number }
  | { valid: false; code: "TOO_LARGE" | "SERIALIZATION"; bytes?: number };

export function validateSerializedSize(
  value: unknown,
  maxBytes = SNAPSHOT_V1_LIMITS.serializedBytes
): SerializedSizeValidationResult {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return { valid: false, code: "SERIALIZATION" };
    }

    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > maxBytes) {
      return { valid: false, code: "TOO_LARGE", bytes };
    }

    return { valid: true, bytes };
  } catch {
    return { valid: false, code: "SERIALIZATION" };
  }
}
