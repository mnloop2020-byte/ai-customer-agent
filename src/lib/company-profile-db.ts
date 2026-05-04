import { CompanyProfile } from "@/domain/company";
import { prisma } from "@/lib/db";

type CompanyWithServices = {
  name: string;
  industry: string | null;
  description: string | null;
  aiPersona: string | null;
  workingHours: string | null;
  location: string | null;
  handoffRules: unknown;
  // حقل الأوامر الإلزامية الجديد
  executionRules: string | null;
  services: Array<{
    name: string;
    priceLabel: string | null;
    basePrice: { toString(): string } | null;
    description: string | null;
  }>;
};

export async function getCompanyProfile(companyId: string): Promise<CompanyProfile> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { services: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  return toCompanyProfile(company);
}

export async function getCompanyProfileBySlug(slug: string): Promise<CompanyProfile> {
  const company = await prisma.company.findUnique({
    where: { slug },
    include: { services: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  return toCompanyProfile(company);
}

function toCompanyProfile(company: CompanyWithServices): CompanyProfile {
  return {
    name: company.name,
    industry: company.industry ?? "",
    description: company.description ?? "",
    tone: company.aiPersona ?? "ردود عربية مهنية ومختصرة.",
    workingHours: company.workingHours ?? "",
    location: company.location ?? "",
    handoffRule: formatHandoffRules(company.handoffRules),
    // إذا لم يُضبط من لوحة التحكم، يُرجع string فارغ → runtime.ts يستخدم القواعد الافتراضية
    executionRules: company.executionRules ?? "",
    services: company.services.map((service) => ({
      name: service.name,
      price: service.priceLabel ?? (service.basePrice ? `${service.basePrice.toString()} USD` : "حسب الطلب"),
      description: service.description ?? "",
    })),
    faqs: [],
  };
}

function formatHandoffRules(value: unknown) {
  if (Array.isArray(value)) return value.join("\n");
  if (typeof value === "string") return value;
  return "";
}