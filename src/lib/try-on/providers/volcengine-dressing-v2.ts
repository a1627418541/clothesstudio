import * as VolcengineOpenApi from "@volcengine/openapi";
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

interface SignableRequest {
  region: string;
  method: "POST";
  params: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

interface SignerInstance {
  addAuthorization(
    credentials: { accessKeyId: string; secretKey: string },
    date?: Date
  ): void;
}

type SignerConstructor = new (request: SignableRequest, service: string) => SignerInstance;

const Signer = (VolcengineOpenApi as unknown as { Signer: SignerConstructor }).Signer;

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
  dependencies: { transport?: VolcengineTransport } = {}
): VolcengineDressingClient {
  const region = config.region ?? "cn-beijing";
  const transport = dependencies.transport ?? defaultTransport;

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
    const signableRequest: SignableRequest = {
      region,
      method: "POST",
      params,
      headers,
      body: serializedBody,
    };
    const signer = new Signer(signableRequest, SERVICE);
    signer.addAuthorization({
      accessKeyId: config.accessKeyId,
      secretKey: config.secretAccessKey,
    }, new Date());

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
