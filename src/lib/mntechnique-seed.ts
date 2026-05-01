import { mntechniqueProfile } from "@/domain/mntechnique";
import { prisma } from "@/lib/db";

export async function ensureMntechniqueCompany() {
  const company = await prisma.company.upsert({
    where: { slug: "mntechnique" },
    update: {
      name: mntechniqueProfile.name,
      industry: mntechniqueProfile.industry,
      description: mntechniqueProfile.description,
      location: mntechniqueProfile.location,
      workingHours: mntechniqueProfile.workingHours,
      aiPersona: mntechniqueProfile.tone,
      handoffRules: mntechniqueProfile.handoffRule.split("\n").filter(Boolean),
      timezone: "Europe/Istanbul",
    },
    create: {
      name: mntechniqueProfile.name,
      slug: "mntechnique",
      industry: mntechniqueProfile.industry,
      description: mntechniqueProfile.description,
      location: mntechniqueProfile.location,
      workingHours: mntechniqueProfile.workingHours,
      aiPersona: mntechniqueProfile.tone,
      handoffRules: mntechniqueProfile.handoffRule.split("\n").filter(Boolean),
      timezone: "Europe/Istanbul",
    },
  });

  await Promise.all(
    mntechniqueProfile.services.map((service) =>
      prisma.service.upsert({
        where: {
          companyId_name: {
            companyId: company.id,
            name: service.name,
          },
        },
        update: {
          description: service.description,
          priceLabel: service.price,
          isActive: true,
        },
        create: {
          companyId: company.id,
          name: service.name,
          description: service.description,
          priceLabel: service.price,
        },
      }),
    ),
  );

  return company;
}

