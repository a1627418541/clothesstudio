import { FaceSwapProvider, FaceSwapInput, FaceSwapResult } from "./face-swap-provider";

interface ReplicatePrediction {
  id: string;
  status: string;
  output: string | string[] | null;
  error?: string | null;
  urls?: {
    get?: string;
  } | null;
}

function getPredictionOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
    return output[0];
  }
  return null;
}

function getReplicateApiToken(): string | null {
  return process.env.REPLICATE_API_TOKEN?.trim() || null;
}

function getModelEndpoint(): string {
  return (
    process.env.REPLICATE_FACE_SWAP_MODEL?.trim() ||
    "lucataco/face-swap:1fac7aa1c7b5f6a3497910b4da9acd8d1e7941f0a6a1f6a6b2a8e1b2d7e8f9a0"
  );
}

async function startPrediction(
  apiToken: string,
  modelEndpoint: string,
  input: FaceSwapInput
): Promise<ReplicatePrediction> {
  const response = await fetch(`https://api.replicate.com/v1/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: modelEndpoint.includes(":")
        ? modelEndpoint.split(":").pop()
        : undefined,
      input: {
        swap_image: input.faceImageUrl,
        target_image: input.sourceImageUrl,
      },
    }),
  });

  if (!response.ok) {
    let detail = `Replicate face swap failed: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string; error?: string };
      detail = body.detail || body.error || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await response.json()) as ReplicatePrediction;
}

async function pollPrediction(
  apiToken: string,
  getUrl: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  maxAttempts = 60,
  pollIntervalMs = 2_000
): Promise<ReplicatePrediction> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImpl(getUrl, {
      method: "GET",
      headers: {
        Authorization: `Token ${apiToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Replicate prediction query failed: ${response.status}`);
    }

    const prediction = (await response.json()) as ReplicatePrediction;
    const status = prediction.status.toLowerCase();

    if (status === "succeeded" || status === "completed") {
      return prediction;
    }
    if (status === "failed" || status === "canceled" || status === "cancelled") {
      throw new Error(prediction.error || "Replicate face swap task failed");
    }

    if (attempt < maxAttempts - 1) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error("Replicate face swap task timed out");
}

export function createReplicateFaceSwapProvider({
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
} = {}): FaceSwapProvider {
  return {
    swap: async (input: FaceSwapInput): Promise<FaceSwapResult> => {
      const apiToken = getReplicateApiToken();
      if (!apiToken) {
        return { url: null, error: "REPLICATE_API_TOKEN is not configured" };
      }

      if (!input.faceImageUrl || !input.sourceImageUrl) {
        return { url: null, error: "faceImageUrl and sourceImageUrl are required" };
      }

      try {
        const modelEndpoint = getModelEndpoint();
        const prediction = await startPrediction(apiToken, modelEndpoint, input);

        if (
          prediction.status.toLowerCase() === "succeeded" ||
          prediction.status.toLowerCase() === "completed"
        ) {
          return { url: getPredictionOutputUrl(prediction.output) };
        }

        if (!prediction.urls?.get) {
          return { url: null, error: "Replicate prediction did not return a polling URL" };
        }

        const finalPrediction = await pollPrediction(
          apiToken,
          prediction.urls.get,
          fetchImpl,
          sleep
        );
        return { url: getPredictionOutputUrl(finalPrediction.output) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown face swap error";
        return { url: null, error: message };
      }
    },
  };
}

export const replicateFaceSwapProvider: FaceSwapProvider = createReplicateFaceSwapProvider();
