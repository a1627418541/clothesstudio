import { loadEnvConfig } from "@next/env";
import {
  createVolcengineDressingSdkClient,
  type VolcengineTransport,
} from "../src/lib/try-on/providers/volcengine-dressing-v2";

loadEnvConfig(process.cwd());

const transport: VolcengineTransport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  });
  const text = await response.text();
  console.log(`HTTP_STATUS=${response.status}`);
  console.log(`BODY=${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

async function main() {
  const client = createVolcengineDressingSdkClient(
    {
      accessKeyId: process.env.VOLCENGINE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.VOLCENGINE_SECRET_ACCESS_KEY!,
      region: process.env.VOLCENGINE_REGION?.trim() || "cn-beijing",
    },
    { transport, now: () => new Date() }
  );

  try {
    const result = await client.submit({
      reqKey: "dressing_diffusionV2",
      personImageUrl: "https://example.com/probe-person.jpg",
      garments: [{ type: "upper", imageUrl: "https://example.com/probe-top.jpg" }],
    });
    console.log("UNEXPECTED_SUCCESS", JSON.stringify(result));
  } catch (error) {
    console.log(`CLIENT_ERROR=${(error as Error).message.slice(0, 200)}`);
  }
}

void main();
