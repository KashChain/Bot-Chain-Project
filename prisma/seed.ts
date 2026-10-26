import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { SEED_AGENTS } from "../src/lib/seed-agents";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create .env from .env.example first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding ${SEED_AGENTS.length} agents into database...`);

  for (const seed of SEED_AGENTS) {
    await prisma.agent.upsert({
      where: { slug: seed.slug },
      update: {
        name: seed.name,
        description: seed.description,
        category: seed.category,
        capabilities: seed.capabilities,
        usageInstructions: seed.usageInstructions,
        endpoint: seed.endpoint,
        priceWei: seed.priceWei,
        metadataUri: seed.metadataUri ?? null,
        featured: seed.featured ?? false,
      },
      create: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        capabilities: seed.capabilities,
        usageInstructions: seed.usageInstructions,
        endpoint: seed.endpoint,
        priceWei: seed.priceWei,
        ownerAddress: seed.ownerAddress,
        metadataUri: seed.metadataUri ?? null,
        featured: seed.featured ?? false,
      },
    });
    console.log(`Seeded agent: ${seed.slug} (${seed.name})`);
  }

  console.log(`Successfully seeded ${SEED_AGENTS.length} agents.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
