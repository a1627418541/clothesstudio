import { createReplicateFaceSwapProvider } from "@/lib/ai/replicate-face-swap-provider";

async function main() {
  const provider = createReplicateFaceSwapProvider();

  // 使用两张公开可访问的测试图片
  const result = await provider.swap({
    faceImageUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=512&fit=crop",
    sourceImageUrl:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=512&h=512&fit=crop",
  });

  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
