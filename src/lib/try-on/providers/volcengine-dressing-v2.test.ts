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
    expect(JSON.parse(request.body)).toEqual({
      req_key: "dressing_diffusionV2",
      model: { url: "https://input.example/person.jpg" },
      garment: { data: [{ type: "upper", url: "https://input.example/top.jpg" }] },
      req_image_store_type: 1,
    });
  });

  it("queries the official action and parses running then done", async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce({ request_id: "poll-1", data: { status: "running" } })
      .mockResolvedValueOnce({ request_id: "poll-2", data: { status: "done", image_urls: ["https://result.example/done.jpg"] } });
    const client = createClient(transport);

    await expect(client.getResult("task-2")).resolves.toEqual({ status: "running" });
    await expect(client.getResult("task-2")).resolves.toEqual({ status: "done", imageUrl: "https://result.example/done.jpg" });

    const request = transport.mock.calls[0][0];
    expect(request.url).toBe("https://visual.volcengineapi.com/?Action=DressingDiffusionV2GetResult&Version=2024-06-06");
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
