import { prisma } from "../src/lib/db";

/**
 * Cause taxonomy seed (spec §3). The taxonomy is data, not code — new causes
 * launch by inserting rows, never by deploying. slugs are stable identifiers.
 */
interface CauseNode {
  slug: string;
  name: string;
  children?: CauseNode[];
}

const TAXONOMY: CauseNode[] = [
  {
    slug: "health",
    name: "Health",
    children: [
      {
        slug: "cancer",
        name: "Cancer",
        children: [
          { slug: "breast-cancer", name: "Breast cancer" },
          { slug: "leukemia", name: "Leukemia" },
          { slug: "pediatric-cancer", name: "Pediatric cancer" },
        ],
      },
      { slug: "organ-transplant", name: "Organ transplant" },
      { slug: "emergency-surgery", name: "Emergency surgery" },
    ],
  },
  {
    slug: "environment",
    name: "Environment",
    children: [
      { slug: "waste-management", name: "Waste management" },
      { slug: "reforestation", name: "Reforestation" },
      { slug: "clean-water", name: "Clean water" },
    ],
  },
  {
    slug: "education",
    name: "Education",
    children: [
      {
        slug: "child-education",
        name: "Child education",
        children: [
          { slug: "girl-child-education", name: "Girl child education" },
          { slug: "rural-schools", name: "Rural schools" },
        ],
      },
    ],
  },
  {
    slug: "relief",
    name: "Relief",
    children: [
      { slug: "disaster-relief", name: "Disaster relief" },
      { slug: "refugee-support", name: "Refugee support" },
    ],
  },
  {
    slug: "animals",
    name: "Animals",
    children: [
      { slug: "animal-rescue", name: "Animal rescue" },
      { slug: "animal-shelter", name: "Animal shelter" },
    ],
  },
];

async function upsertNode(node: CauseNode, level: number, parentId: string | null) {
  const cause = await prisma.cause.upsert({
    where: { slug: node.slug },
    update: { name: node.name, level, parentId },
    create: { slug: node.slug, name: node.name, level, parentId },
  });
  for (const child of node.children ?? []) {
    await upsertNode(child, level + 1, cause.id);
  }
}

async function main() {
  for (const domain of TAXONOMY) {
    await upsertNode(domain, 0, null);
  }
  const count = await prisma.cause.count();
  console.log(`Seeded cause taxonomy: ${count} nodes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
