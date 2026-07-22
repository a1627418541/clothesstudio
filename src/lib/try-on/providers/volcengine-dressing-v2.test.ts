import { describe, expect, it, vi } from "vitest";
import {
  createVolcengineDressingProvider,
  createVolcengineDressingSdkClient,
  type VolcengineDressingClient,
  type VolcengineTransport,
} from "./volcengine-dressing-v2";

const input = {
  caseId: "case-1",
  personImageUrl: "https://input.example/person.jpg",
  garmentImageUrl: "https://input.example/garment.jpg",
  category: "TOP" as const,
};

describe("Volcengine DressingDiffusionV2 provider", () => {
  it("maps TOP to upper and polls from running to done", async () => {
    const client: VolcengineDressingClient = {
      submit: vi.fn().mockResolvedValue({ taskId: "ve-1", requestId: "req-1" }),
      getResult: vi.fn()
        .mockResolvedValueOnce({ status: "running" })
        .mockResolvedValueOnce({ status: "done", imageUrl: "https://result.example/volc.jpg" }),
    };
    const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 100 });

    await expect(provider.generate(input)).resolves.toEqual({
      imageUrl: "https://result.example/volc.jpg",
      requestId: "req-1",
    });
    expect(client.submit).toHaveBeenCalledWith({
      reqKey: "dressing_diffusionV2",
      personImageUrl: input.personImageUrl,
      garments: [{ type: "upper", imageUrl: input.garmentImageUrl }],
    });
    expect(client.getResult).toHaveBeenCalledTimes(2);
  });

  it("maps BOTTOM to bottom", async () => {
    const client: VolcengineDressingClient = {
      submit: vi.fn().mockResolvedValue({ taskId: "ve-2", requestId: "req-2" }),
      getResult: vi.fn().mockResolvedValue({ status: "done", imageUrl: "https://result.example/bottom.jpg" }),
    };
    const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 100 });

    await provider.generate({ ...input, category: "BOTTOM" });

    expect(client.submit).toHaveBeenCalledWith(expect.objectContaining({
      garments: [{ type: "bottom", imageUrl: input.garmentImageUrl }],
    }));
  });

  it("reports DRESS unsupported and rejects it without a request", async () => {
    const client: VolcengineDressingClient = {
      submit: vi.fn(),
      getResult: vi.fn(),
    };
    const provider = createVolcengineDressingProvider(client);

    expect(provider.supports("TOP")).toBe(true);
    expect(provider.supports("BOTTOM")).toBe(true);
    expect(provider.supports("DRESS")).toBe(false);
    await expect(provider.generate({ ...input, category: "DRESS" })).rejects.toThrow("UNSUPPORTED_CATEGORY");
    expect(client.submit).not.toHaveBeenCalled();
    expect(client.getResult).not.toHaveBeenCalled();
  });

  it("surfaces a failed task code", async () => {
    const client: VolcengineDressingClient = {
      submit: vi.fn().mockResolvedValue({ taskId: "ve-3", requestId: "req-3" }),
      getResult: vi.fn().mockResolvedValue({ status: "failed", code: "CONTENT_RISK" }),
    };
    const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 100 });

    await expect(provider.generate(input)).rejects.toThrow("VOLCENGINE_CONTENT_RISK");
  });

  it("stops polling at the configured timeout", async () => {
    const client: VolcengineDressingClient = {
      submit: vi.fn().mockResolvedValue({ taskId: "ve-4", requestId: "req-4" }),
      getResult: vi.fn().mockResolvedValue({ status: "running" }),
    };
    const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 0 });

    await expect(provider.generate(input)).rejects.toThrow("VOLCENGINE_TIMEOUT");
  });

  it("aborts a hanging getResult request at the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      let receivedSignal: AbortSignal | undefined;
      const client: VolcengineDressingClient = {
        submit: vi.fn().mockResolvedValue({ taskId: "ve-hanging", requestId: "req-hanging" }),
        getResult: vi.fn((_taskId: string, options?: { signal?: AbortSignal }) => {
          if (!options?.signal) throw new Error("MISSING_SIGNAL");
          const signal = options.signal;
          receivedSignal = signal;
          return new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        }),
      };
      const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 10, timeoutMs: 50 });

      const result = provider.generate(input);
      const rejection = expect(result).rejects.toThrow("VOLCENGINE_TIMEOUT");
      await vi.advanceTimersByTimeAsync(50);

      await rejection;
      expect(receivedSignal?.aborted).toBe(true);
      expect(client.getResult).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("truncates sleep to the deadline and makes no second request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const client: VolcengineDressingClient = {
        submit: vi.fn().mockResolvedValue({ taskId: "ve-sleep", requestId: "req-sleep" }),
        getResult: vi.fn().mockResolvedValue({ status: "running" }),
      };
      const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 1_000, timeoutMs: 50 });

      const result = provider.generate(input);
      const rejection = expect(result).rejects.toThrow("VOLCENGINE_TIMEOUT");
      await vi.advanceTimersByTimeAsync(50);

      await rejection;
      expect(client.getResult).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a done result that arrives after the deadline", async () => {
    const now = vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(101);
    try {
      const client: VolcengineDressingClient = {
        submit: vi.fn().mockResolvedValue({ taskId: "ve-late", requestId: "req-late" }),
        getResult: vi.fn().mockResolvedValue({ status: "done", imageUrl: "https://result.example/late.jpg" }),
      };
      const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 100 });

      await expect(provider.generate(input)).rejects.toThrow("VOLCENGINE_TIMEOUT");
      expect(client.getResult).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });
});

describe("Volcengine DressingDiffusionV2 SDK client", () => {
  const createClient = (transport: VolcengineTransport) => createVolcengineDressingSdkClient({
    accessKeyId: "ak",
    secretAccessKey: "sk",
    region: "cn-beijing",
  }, { transport });

  it("submits the official action and body and parses task metadata", async () => {
    const transport = vi.fn().mockResolvedValue({
      request_id: "submit-request",
      data: { task_id: "task-1" },
    });
    const client = createClient(transport);

    await expect(client.submit({
      reqKey: "dressing_diffusionV2",
      personImageUrl: "https://input.example/person.jpg",
      garments: [{ type: "upper", imageUrl: "https://input.example/top.jpg" }],
    })).resolves.toEqual({ taskId: "task-1", requestId: "submit-request" });

    expect(transport).toHaveBeenCalledTimes(1);
    const request = transport.mock.calls[0][0];
    expect(request.url).toBe("https://visual.volcengineapi.com/?Action=DressingDiffusionV2SubmitTask&Version=2024-06-06");
    expect(request.method).toBe("POST");
    const signedHeaders = Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value])
    );
    expect(signedHeaders.authorization).toMatch(/^HMAC-SHA256 /);
    expect(signedHeaders["x-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(signedHeaders["x-content-sha256"]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(request.body)).toEqual({
      req_key: "dressing_diffusionV2",
      model: { url: "https://input.example/person.jpg" },
      garment: { data: [{ type: "upper", url: "https://input.example/top.jpg" }] },
      req_image_store_type: 1,
    });
  });

  it("matches the official signer output for a fixed request vector", async () => {
    const transport = vi.fn().mockResolvedValue({
      request_id: "submit-vector",
      data: { task_id: "task-vector" },
    });
    const client = createVolcengineDressingSdkClient(
      {
        accessKeyId: "ak",
        secretAccessKey: "sk",
        region: "cn-beijing",
      },
      {
        transport,
        now: () => new Date("2026-07-22T10:00:00.000Z"),
      }
    );

    await client.submit({
      reqKey: "dressing_diffusionV2",
      personImageUrl: "https://input.example/person.jpg",
      garments: [{ type: "upper", imageUrl: "https://input.example/top.jpg" }],
    });

    const headers = Object.fromEntries(
      Object.entries(transport.mock.calls[0][0].headers)
        .map(([name, value]) => [name.toLowerCase(), value])
    );
    expect(headers["x-date"]).toBe("20260722T100000Z");
    expect(headers["x-content-sha256"]).toBe(
      "141e5fae43cf526c80dfaa9232a5bb6e3750c9968e5e70c80cb7a7d3e514e425"
    );
    expect(headers.authorization).toBe(
      "HMAC-SHA256 Credential=ak/20260722/cn-beijing/cv/request, " +
      "SignedHeaders=host;x-content-sha256;x-date, " +
      "Signature=e93c3b6400b5bcd5338c88bf3565d39f477d6f427fe10d996a488b5eac94c540"
    );
  });

  it("queries the official action and parses running then done", async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce({ request_id: "poll-1", data: { status: "running" } })
      .mockResolvedValueOnce({ request_id: "poll-2", data: { status: "done", image_urls: ["https://result.example/done.jpg"] } });
    const client = createClient(transport);

    const controller = new AbortController();
    await expect(client.getResult("task-2", { signal: controller.signal })).resolves.toEqual({ status: "running" });
    await expect(client.getResult("task-2")).resolves.toEqual({ status: "done", imageUrl: "https://result.example/done.jpg" });

    const request = transport.mock.calls[0][0];
    expect(request.url).toBe("https://visual.volcengineapi.com/?Action=DressingDiffusionV2GetResult&Version=2024-06-06");
    expect(request.signal).toBe(controller.signal);
    expect(JSON.parse(request.body)).toEqual({
      req_key: "dressing_diffusionV2",
      task_id: "task-2",
      req_json: JSON.stringify({ return_url: true }),
    });
  });

  it("parses a failed result", async () => {
    const transport = vi.fn().mockResolvedValue({
      request_id: "poll-failed",
      data: { status: "failed", error_code: "INVALID_IMAGE" },
    });
    const client = createClient(transport);

    await expect(client.getResult("task-3")).resolves.toEqual({
      status: "failed",
      code: "INVALID_IMAGE",
    });
  });
});
