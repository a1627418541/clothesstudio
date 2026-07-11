type ParsedStylePreviewResponse =
  | { url: string | null; base64: string | null }
  | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : null;
}

function stringValue(
  record: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

export function parseStylePreviewResponse(
  value: unknown
): ParsedStylePreviewResponse {
  if (!isRecord(value)) {
    const responseType = value === null ? "null" : typeof value;
    return {
      error: `Image response contained no image data (response type: ${responseType})`,
    };
  }

  const item = firstRecord(value.data) ?? firstRecord(value.images);
  const url = stringValue(item, ["url"]);
  const base64 = stringValue(item, ["b64_json", "base64"]);

  if (url || base64) {
    return { url, base64 };
  }

  const topLevelKeys = Object.keys(value).sort().join(", ") || "none";
  const itemKeys = item ? Object.keys(item).sort().join(", ") || "none" : "none";

  return {
    error:
      "Image response contained no image data " +
      `(top-level keys: ${topLevelKeys}; item keys: ${itemKeys})`,
  };
}
