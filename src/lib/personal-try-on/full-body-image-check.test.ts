import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { checkFullBodyImageSize } from "./full-body-image-check";

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 64, b: 200 } },
  })
    .png()
    .toBuffer();
}

function clientWith(
  body: unknown,
  meta: { contentType?: string; contentLength?: number } = {}
) {
  return {
    send: vi.fn(async () => ({
      ContentType: meta.contentType ?? "image/png",
      ContentLength: meta.contentLength,
      Body: body,
    })),
  };
}

describe("checkFullBodyImageSize", () => {
  it("rejects an undersized full-body image before any provider call", async () => {
    const buffer = await pngBuffer(525, 790);
    const client = clientWith(Readable.from(buffer), { contentLength: buffer.length });

    const result = await checkFullBodyImageSize({ bucket: "b", key: "k", client: client as never });

    expect(result).toEqual({ ok: false, code: "FULL_BODY_IMAGE_TOO_SMALL" });
  });

  it("accepts an image meeting the minimum edges", async () => {
    const buffer = await pngBuffer(1600, 900);
    const client = clientWith(Readable.from(buffer), { contentLength: buffer.length });

    const result = await checkFullBodyImageSize({ bucket: "b", key: "k", client: client as never });

    expect(result).toEqual({ ok: true });
  });

  it("accepts an image exactly at the threshold", async () => {
    const buffer = await pngBuffer(1200, 700);
    const client = clientWith(Readable.from(buffer), { contentLength: buffer.length });

    const result = await checkFullBodyImageSize({ bucket: "b", key: "k", client: client as never });

    expect(result).toEqual({ ok: true });
  });

  it("maps unsupported mime types to a stable unreadable code", async () => {
    const buffer = await pngBuffer(1600, 900);
    const client = clientWith(Readable.from(buffer), { contentType: "image/gif" });

    const result = await checkFullBodyImageSize({ bucket: "b", key: "k", client: client as never });

    expect(result).toEqual({ ok: false, code: "FULL_BODY_IMAGE_UNREADABLE" });
  });

  it("rejects oversize objects without buffering them", async () => {
    const client = clientWith(Readable.from(Buffer.alloc(16)), {
      contentLength: 20 * 1024 * 1024,
    });

    const result = await checkFullBodyImageSize({ bucket: "b", key: "k", client: client as never });

    expect(result).toEqual({ ok: false, code: "FULL_BODY_IMAGE_UNREADABLE" });
  });

  it("maps corrupt image data to a stable unreadable code", async () => {
    const client = clientWith(Readable.from(Buffer.from("not an image")), {
      contentLength: 12,
    });

    const result = await checkFullBodyImageSize({ bucket: "b", key: "k", client: client as never });

    expect(result).toEqual({ ok: false, code: "FULL_BODY_IMAGE_UNREADABLE" });
  });

  it("maps storage errors to a stable code without leaking object details", async () => {
    const client = {
      send: vi.fn(async () => {
        throw new Error("NoSuchKey: secret-bucket/secret-key");
      }),
    };

    const result = await checkFullBodyImageSize({
      bucket: "secret-bucket",
      key: "secret-key",
      client: client as never,
    });

    expect(result).toEqual({ ok: false, code: "FULL_BODY_IMAGE_UNREADABLE" });
    expect(JSON.stringify(result)).not.toContain("secret-bucket");
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });
});
