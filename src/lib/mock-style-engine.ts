export interface MockStyleInput {
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
}

export interface MockStyleRecommendation {
  title: string;
  description: string;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
}

export interface MockStyleRecommendationsOutput {
  bodyType: string;
  faceShape: string;
  vibeKeywords: string[];
  summary: string;
  recommendations: MockStyleRecommendation[];
}

const PALETTES: Record<MockStyleInput["gender"], string[]> = {
  MALE: ["navy", "white", "light gray", "camel", "olive"],
  FEMALE: ["ivory", "taupe", "dusty rose", "charcoal", "soft white"],
  OTHER: ["black", "ecru", "sage green", "slate gray", "tan"],
};

const AVOID_TIPS: Record<MockStyleInput["gender"], string[]> = {
  MALE: ["oversized silhouettes", "neon colors", "excessive logos"],
  FEMALE: ["busy prints", "heavy accessories", "high-contrast clashes"],
  OTHER: ["rigid gendered cuts", "overly bright primaries", "bulky layering"],
};

interface BilingualText {
  en: string;
  cn: string;
}

function joinBilingual(base: BilingualText, notes: BilingualText[]): string {
  const enParts = [base.en, ...notes.map((n) => n.en)].filter(Boolean);
  const cnParts = [base.cn, ...notes.map((n) => n.cn)].filter(Boolean);
  return `${enParts.join(" ")} / ${cnParts.join("")}`;
}

function baseStyle(gender: MockStyleInput["gender"]) {
  switch (gender) {
    case "MALE":
      return {
        title: "Clean Casual / 干净休闲",
        description: "An easy-to-wear everyday style built on simple silhouettes and neutral colors. / 基于简洁廓形和中性色的易穿日常风格。",
        summary:
          "A relaxed but polished everyday look that keeps silhouettes simple and fabrics breathable. / 轻松但精致的日常造型，剪裁简洁、面料透气。",
        clothingAdvice: {
          en: "Start with a well-fitting crew-neck tee or oxford shirt, paired with tapered chinos or dark denim. Add a lightweight unstructured blazer for polish.",
          cn: "从合身的圆领 T 恤或牛津衬衫开始，搭配锥形 chino 或深色牛仔。加一件轻质无结构西装外套提升精致感。",
        },
        hairstyleAdvice:
          "Keep hair neatly trimmed with natural texture; a side part or textured crop works well. / 保持头发自然纹理并整洁修剪，侧分或纹理短发都很合适。",
        shoesAdvice:
          "Clean white leather sneakers or minimalist loafers ground the outfit without looking too formal. / 干净的白色皮质运动鞋或极简乐福鞋，既不过于正式也很稳重。",
      };
    case "FEMALE":
      return {
        title: "Soft Minimal / 柔和极简",
        description: "An easy-to-wear everyday style built on simple silhouettes and neutral colors. / 基于简洁廓形和中性色的易穿日常风格。",
        summary:
          "Gentle tones and flowing lines create a calm, modern femininity without excess detail. / 柔和色调与流畅线条，打造不过分装饰的 calm 现代女性气质。",
        clothingAdvice: {
          en: "Choose a soft knit top with wide-leg trousers or a midi skirt in muted tones. Layer with a longline cardigan or tailored coat.",
          cn: "选择柔和针织上衣，搭配阔腿裤或柔和色调的中长裙。外搭长款开衫或合身大衣。",
        },
        hairstyleAdvice:
          "A low bun, soft waves, or a sleek ponytail keeps the focus on clean lines. / 低发髻、柔和波浪或利落马尾，让整体造型线条更干净。",
        shoesAdvice:
          "Neutral flats, minimalist ankle boots, or low-block heels keep the look effortless. / 中性色平底鞋、极简踝靴或低跟粗跟鞋，让造型 effortless。",
      };
    case "OTHER":
      return {
        title: "Gender Neutral / 无性别风",
        description: "An easy-to-wear everyday style built on simple silhouettes and neutral colors. / 基于简洁廓形和中性色的易穿日常风格。",
        summary:
          "Balanced silhouettes and muted palettes that sit outside traditional gendered dressing. / 平衡廓形与低饱和配色，跳出传统性别化着装框架。",
        clothingAdvice: {
          en: "Mix oversized shirts with straight-cut trousers or relaxed jumpsuits in natural fabrics. Balance volume on top and bottom.",
          cn: "宽松衬衫搭配直筒裤或休闲连体裤，选用天然面料。上下半身廓形保持平衡。",
        },
        hairstyleAdvice:
          "A tousled pixie, shoulder-length layered cut, or simple top knot all fit; keep maintenance low. / 凌乱短发、及肩层次剪或简单丸子头都可以，保持低维护。",
        shoesAdvice:
          "Chunky derbies, clean canvas sneakers, or Chelsea boots add structure without leaning masculine or feminine. / 厚底德比鞋、干净帆布运动鞋或切尔西靴，增加结构感而不偏向某一性别。",
      };
  }
}

export function generateMockStyleRecommendation(input: MockStyleInput): MockStyleRecommendation {
  const style = baseStyle(input.gender);
  const notes: BilingualText[] = [];

  if (input.age >= 40) {
    notes.push({
      en: "Prioritize fit and tailoring over trends.",
      cn: "优先考虑合身与剪裁，而非追逐潮流。",
    });
  } else if (input.age < 25) {
    notes.push({
      en: "Experiment with textures and relaxed cuts while keeping the palette cohesive.",
      cn: "可以尝试不同面料和宽松剪裁，但保持配色统一。",
    });
  }

  if (input.heightCm < 160) {
    notes.push({
      en: "Use vertical lines and high-rise bottoms to elongate proportions.",
      cn: "利用竖向线条和高腰下装拉长比例。",
    });
  } else if (input.heightCm >= 175) {
    notes.push({
      en: "Balance structure with a single intentionally oversized piece.",
      cn: "用一件刻意的宽松单品来平衡整体造型结构。",
    });
  }

  const weightThreshold = input.gender === "MALE" ? 85 : 75;
  if (input.weightKg >= weightThreshold) {
    notes.push({
      en: "Choose structured, breathable fabrics in darker tones for a clean silhouette.",
      cn: "选择有结构感、透气的深色面料，保持利落廓形。",
    });
  } else if (input.weightKg < 55) {
    notes.push({
      en: "Add light layering and tactile textures to create gentle volume.",
      cn: "通过轻薄叠穿和质感面料营造柔和体量。",
    });
  }

  return {
    ...style,
    clothingAdvice: joinBilingual(style.clothingAdvice, notes),
    colorPalette: PALETTES[input.gender],
    avoidTips: AVOID_TIPS[input.gender],
  };
}

function alternativeStyle(
  gender: MockStyleInput["gender"],
  variant: "polished" | "relaxed"
): MockStyleRecommendation {
  const base = generateMockStyleRecommendation({ gender, age: 30, heightCm: 170, weightKg: 65 });
  if (variant === "polished") {
    return {
      ...base,
      title: gender === "FEMALE" ? "Polished Commuter / 精致通勤" : "Smart Casual / 精明休闲",
      summary: "A refined, office-ready direction with tailored lines and neutral palettes. / 精致、适合办公的方向，剪裁利落、配色中性。",
    };
  }
  return {
    ...base,
    title: gender === "FEMALE" ? "Relaxed Personal / 随性自我" : "Laid-back Utility / 休闲机能",
    summary: "A comfortable, expressive direction that prioritizes ease and personal taste. / 舒适、富有个性的方向，强调轻松与个人喜好。",
  };
}

export function generateMockStyleRecommendations(
  input: MockStyleInput
): MockStyleRecommendationsOutput {
  const primary = generateMockStyleRecommendation(input);
  const alt1 = alternativeStyle(input.gender, "polished");
  const alt2 = alternativeStyle(input.gender, "relaxed");

  return {
    bodyType: input.gender === "FEMALE" ? "hourglass" : "rectangle",
    faceShape: "oval",
    vibeKeywords: ["clean", "minimal", "balanced", "modern", "effortless"],
    summary: "Overall direction leans toward clean, balanced silhouettes with a modern, effortless feel. / 整体方向偏向干净、平衡的廓形，呈现现代、不费力的感觉。",
    recommendations: [primary, alt1, alt2],
  };
}
