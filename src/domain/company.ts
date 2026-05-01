import { z } from "zod";

export const serviceSchema = z.object({
  name: z.string().trim().min(1),
  price: z.string().trim().default(""),
  description: z.string().trim().default(""),
});

export const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1),
  industry: z.string().trim().default(""),
  description: z.string().trim().default(""),
  tone: z.string().trim().default(""),
  workingHours: z.string().trim().default(""),
  location: z.string().trim().default(""),
  handoffRule: z.string().trim().default(""),
  services: z.array(serviceSchema).default([]),
  faqs: z.array(faqSchema).default([]),
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const defaultCompanyProfile: CompanyProfile = {
  name: "MNtechnique",
  industry: "تقنية، ذكاء اصطناعي، خدمة عملاء",
  description: "شركة تقدم حلول ذكاء اصطناعي لإدارة خدمة العملاء وتحسين تجربة المستخدم.",
  tone: "ردود عربية واضحة، مهنية، مختصرة، بدون اختراع معلومات غير موجودة.",
  workingHours: "من 9 صباحًا إلى 6 مساءً",
  location: "اسطنبول، تركيا",
  handoffRule:
    "حوّل العميل لمندوب عند طلب عرض مخصص، سؤال تقني متقدم، اهتمام واضح بالشراء، غضب أو عدم رضا، سؤال خارج نطاق الخدمات، طلب تواصل مباشر، أو سؤال فوترة ودفع.",
  services: [
    {
      name: "بناء أنظمة ذكاء اصطناعي",
      price: "باقة أساسية 100$، باقة احترافية 300$",
      description: "بناء حلول AI Agent وأنظمة ذكاء اصطناعي مخصصة للشركات.",
    },
    {
      name: "إدارة خدمة العملاء",
      price: "باقة أساسية 100$، باقة احترافية 300$",
      description: "تحسين تجربة المستخدم وتنظيم الردود والمتابعة مع العملاء.",
    },
  ],
  faqs: [
    {
      question: "ما ساعات العمل؟",
      answer: "ساعات العمل من 9 صباحًا إلى 6 مساءً.",
    },
    {
      question: "أين موقع الشركة؟",
      answer: "موقع الشركة في اسطنبول، تركيا.",
    },
  ],
};
