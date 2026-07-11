import { GenderScope } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ALL_ARCHETYPES } from "../src/lib/style-archetype/archetype-data";

export async function seedStyleArchetypes() {
  for (const def of ALL_ARCHETYPES) {
    await prisma.styleArchetype.upsert({
      where: { slug: def.slug },
      update: {
        name: def.name,
        personalityLabel: def.personalityLabel,
        genderScope: def.genderScope as GenderScope,
        category: def.category,
        description: def.description,
        keywords: def.keywords,
        clothingDNA: def.clothingDNA,
        hairstyleDNA: def.hairstyleDNA,
        shoesDNA: def.shoesDNA,
        colorDNA: def.colorDNA,
        avoidDNA: def.avoidDNA,
        imagePromptTemplate: def.imagePromptTemplate,
        version: 1,
        active: true,
      },
      create: {
        slug: def.slug,
        name: def.name,
        personalityLabel: def.personalityLabel,
        genderScope: def.genderScope as GenderScope,
        category: def.category,
        description: def.description,
        keywords: def.keywords,
        clothingDNA: def.clothingDNA,
        hairstyleDNA: def.hairstyleDNA,
        shoesDNA: def.shoesDNA,
        colorDNA: def.colorDNA,
        avoidDNA: def.avoidDNA,
        imagePromptTemplate: def.imagePromptTemplate,
        version: 1,
        active: true,
      },
    });
  }
}

async function main() {
  await seedStyleArchetypes();
  console.log(`Seeded ${ALL_ARCHETYPES.length} style archetypes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
