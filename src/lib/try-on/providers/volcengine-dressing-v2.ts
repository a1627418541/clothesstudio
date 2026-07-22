import { createHash, createHmac } from "node:crypto";
import type { DomesticTryOnProvider } from "../benchmark/types";

const SERVICE = "cv";
const HOST = "visual.volcengineapi.com";
const VERSION = "2024-06-06";
const REQ_KEY = "dressing_diffusionV2" as const;

type SupportedGarmentType = "upper" | "bottom";

export interface VolcengineDressingClient {
  submit(input: {
    reqKey: typeof REQ_KEY;
    personImageUrl: string;
    garments: Array<{ type: SupportedGarmentType; imageUrl: string }>;
  }): Promise<{ taskId: string; requestId: string }>;
  getResult(taskId: string, options?: { signal?: AbortSignal }): Promise<
    | { status: "running" }
    | { status: "done"; imageUrl: string }
    | { status: "failed"; code: string }
  >;
}

export interface VolcengineHttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export type VolcengineTransport = (request: VolcengineHttpRequest) => Promise<unknown>;

const UNSIGNABLE_HEADERS = new Set([
  "authorization",
  "content-type",
  "content-length",
  "user-agent",
  "presigned-expires",
  "expect",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function uriEscape(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function addVolcengineAuthorization(input: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  action: string;
  body: string;
  headers: Record<string, string>;
  date: Date;
}): void {
  const datetime = input.date.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const shortDate = datetime.slice(0, 8);
  const bodyHash = sha256(input.body);
  input.headers["X-Date"] = datetime;
  input.headers["X-Content-Sha256"] = bodyHash;

  const signedHeaderEntries = Object.entries(input.headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .filter(([name]) => !UNSIGNABLE_HEADERS.has(name))
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = signedHeaderEntries.map(([name]) => name).join(";");
  const canonicalHeaders = signedHeaderEntries
    .map(([name, value]) => `${name}:${value}`)
    .join("\n");
  const canonicalQuery = [
    ["Action", input.action],
    ["Version", VERSION],
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${uriEscape(name)}=${uriEscape(value)}`)
    .join("&");
  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    bodyHash,
  ].join("\n");
  const scope = `${shortDate}/${input.region}/${SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    datetime,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(input.secretAccessKey, shortDate), input.region), SERVICE),
    "request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  input.headers.Authorization =
    `HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createVolcengineDressingProvider(
  client: VolcengineDressingClient,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): DomesticTryOnProvider {
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    name: "volcengine",
    supports: (category) => category === "TOP" || category === "BOTTOM",
    async generate(input) {
      if (input.category === "DRESS") {
        throw new Error("UNSUPPORTED_CATEGORY");
      }

      const submitted = await client.submit({
        reqKey: REQ_KEY,
        personImageUrl: input.personImageUrl,
        garments: [{
          type: input.category === "TOP" ? "upper" : "bottom",
          imageUrl: input.garmentImageUrl,
        }],
      });
      const deadline = Date.now() + timeoutMs;

      while (true) {
        const remainingBeforePoll = deadline - Date.now();
        if (remainingBeforePoll <= 0) {
          throw new Error("VOLCENGINE_TIMEOUT");
        }

        const controller = new AbortController();
        const abortTimer = setTimeout(
          () => controller.abort(new Error("VOLCENGINE_TIMEOUT")),
          remainingBeforePoll
        );
        let result: Awaited<ReturnType<VolcengineDressingClient["getResult"]>>;
        try {
          result = await client.getResult(submitted.taskId, { signal: controller.signal });
        } catch (error) {
          if (controller.signal.aborted || Date.now() >= deadline) {
            throw new Error("VOLCENGINE_TIMEOUT");
          }
          throw error;
        } finally {
          clearTimeout(abortTimer);
        }

        if (Date.now() >= deadline) {
          throw new Error("VOLCENGINE_TIMEOUT");
        }
        if (result.status === "done") {
          return { imageUrl: result.imageUrl, requestId: submitted.requestId };
        }
        if (result.status === "failed") {
          throw new Error(`VOLCENGINE_${result.code}`);
        }
        const remainingBeforeSleep = deadline - Date.now();
        if (remainingBeforeSleep <= 0) {
          throw new Error("VOLCENGINE_TIMEOUT");
        }
        await wait(Math.min(pollIntervalMs, remainingBeforeSleep));
      }
    },
  };
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("VOLCENGINE_INVALID_RESPONSE");
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("VOLCENGINE_INVALID_RESPONSE");
  }
  return value;
}

const defaultTransport: VolcengineTransport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`VOLCENGINE_HTTP_${response.status}`);
  }
  return payload;
};

export function createVolcengineDressingSdkClient(
  config: {
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
  },
  dependencies: {
    transport?: VolcengineTransport;
    now?: () => Date;
  } = {}
): VolcengineDressingClient {
  const region = config.region ?? "cn-beijing";
  const transport = dependencies.transport ?? defaultTransport;
  const now = dependencies.now ?? (() => new Date());

  async function request(
    action: string,
    body: Record<string, unknown>,
    signal: AbortSignal = new AbortController().signal
  ): Promise<Record<string, unknown>> {
    const params = { Action: action, Version: VERSION };
    const headers: Record<string, string> = {
      Host: HOST,
      "Content-Type": "application/json",
    };
    const serializedBody = JSON.stringify(body);
    addVolcengineAuthorization({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region,
      action,
      body: serializedBody,
      headers,
      date: now(),
    });

    const query = new URLSearchParams(params).toString();
    return expectRecord(await transport({
      url: `https://${HOST}/?${query}`,
      method: "POST",
      headers,
      body: serializedBody,
      signal,
    }));
  }

  return {
    async submit(input) {
      const response = await request("DressingDiffusionV2SubmitTask", {
        req_key: input.reqKey,
        model: { url: input.personImageUrl },
        garment: {
          data: input.garments.map((garment) => ({
            type: garment.type,
            url: garment.imageUrl,
          })),
        },
        req_image_store_type: 1,
      });
      const data = expectRecord(response.data);
      return {
        taskId: expectString(data.task_id),
        requestId: expectString(response.request_id),
      };
    },

    async getResult(taskId, options) {
      const response = await request("DressingDiffusionV2GetResult", {
        req_key: REQ_KEY,
        task_id: taskId,
        req_json: JSON.stringify({ return_url: true }),
      }, options?.signal);
      const data = expectRecord(response.data);
      const status = expectString(data.status);

      if (status === "running") {
        return { status: "running" };
      }
      if (status === "done") {
        if (!Array.isArray(data.image_urls)) {
          throw new Error("VOLCENGINE_INVALID_RESPONSE");
        }
        return { status: "done", imageUrl: expectString(data.image_urls[0]) };
      }
      if (status === "failed") {
        return { status: "failed", code: expectString(data.error_code) };
      }
      throw new Error("VOLCENGINE_INVALID_RESPONSE");
    },
  };
}
