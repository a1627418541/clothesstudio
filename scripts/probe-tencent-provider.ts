import { createTencentVirtualTryOnProvider } from "@/lib/try-on/providers/tencent-virtual-try-on";

const bodyUrl = "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/uploads/anonymous/cmrwuo2zl0000jou9yqmy7h1d/z3BGBFSxmF6BHigb.jpg";
const topUrl = "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/try-on/garments/top/clean-casual-%E5%B9%B2%E5%87%80%E4%BC%91%E9%97%B2-top-w6n11e-1784771346250.png";
const bottomUrl = "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/try-on/garments/bottom/clean-casual-%E5%B9%B2%E5%87%80%E4%BC%91%E9%97%B2-bottom-ky0ymd-1784771343474.png";

async function main() {
  const provider = createTencentVirtualTryOnProvider();
  console.log("Provider:", provider.name);

  try {
    console.log("Step 1: apply TOP...");
    const topResult = await provider.applyGarment({
      personImageUrl: bodyUrl,
      productImageUrl: topUrl,
      category: "TOP",
    });
    console.log("TOP OK:", topResult.imageUrl.slice(0, 80));

    console.log("Step 2: apply BOTTOM...");
    const bottomResult = await provider.applyGarment({
      personImageUrl: topResult.imageUrl,
      productImageUrl: bottomUrl,
      category: "BOTTOM",
    });
    console.log("BOTTOM OK:", bottomResult.imageUrl.slice(0, 80));
  } catch (error) {
    console.error("Provider failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
