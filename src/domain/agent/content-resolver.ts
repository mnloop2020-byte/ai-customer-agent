import type { CompanyProfile } from "@/domain/company";
import type { KnowledgeSearchResult } from "@/domain/knowledge";
import type { AgentResponseContract } from "@/domain/agent/response-contract";

export type ResolvedResponseContent = {
  pricing: string;
  quote: string;
  location: string;
  service: string;
  howItWorks: string;
  whatsapp: string;
  identity: string;
  handoff: string;
  knowledge: string[];
};

export function resolveResponseContent(input: {
  contract: AgentResponseContract;
  companyProfile: CompanyProfile;
  knowledgeResults?: KnowledgeSearchResult[];
}): ResolvedResponseContent {
  const knowledge = (input.knowledgeResults ?? []).map((result) => result.content).filter(Boolean);
  const pricingKnowledge = knowledge.find((content) => /price|pricing|سعر|أسعار|باقة|\$/iu.test(content));
  const serviceLines = input.companyProfile.services.map((service) =>
    `${service.name}: ${service.description} (${service.price})`,
  );
  const prices = [...new Set(input.companyProfile.services.map((service) => service.price.trim()).filter(Boolean))];

  return {
    pricing: pricingKnowledge ?? (prices.join("، ") || "I don't have that information"),
    quote: pricingKnowledge ?? (serviceLines.join(" | ") || "I don't have that information"),
    location: input.companyProfile.location || "I don't have that information",
    service: serviceLines.join(" | ") || input.companyProfile.description,
    howItWorks:
      "ينظم المحادثات، يستخدم مصادر معرفة الشركة للرد على الأسئلة المتكررة، ويحول الحالات المهمة إلى متابعة أو مندوب.",
    whatsapp:
      "يدعم العمل مع قنوات المحادثة مثل واتساب عند تفعيل الربط المناسب وإضافة مصادر معرفة الشركة.",
    identity: `أنا مساعد ${input.companyProfile.name} للمحادثات وخدمة العملاء.`,
    handoff: "أحوّل طلبك لمندوب مناسب حتى يراجع التفاصيل ويتواصل معك مباشرة.",
    knowledge,
  };
}

export function buildContractFallbackReply(input: {
  contract: AgentResponseContract;
  content: ResolvedResponseContent;
  customerFacts?: string[];
}) {
  const facts = input.customerFacts?.length ? `بالاعتماد على ${input.customerFacts.slice(0, 2).join(" و")}، ` : "";
  const needs = new Set(input.contract.mustAnswer);

  if (needs.has("greeting")) return "وعليكم السلام، أهلًا بك.";
  if (needs.has("identity")) return input.content.identity;
  if (needs.has("price") && needs.has("whatsapp")) {
    const how = needs.has("how_it_works") ? " يعمل بتنظيم المحادثات والردود من معرفة الشركة." : "";
    return `الأسعار الحالية: ${input.content.pricing}. وبالنسبة لواتساب، ${input.content.whatsapp}${how}`;
  }
  if (needs.has("price")) return `الأسعار الحالية: ${input.content.pricing}.`;
  if (needs.has("quote")) return `الخيارات المتاحة حاليًا: ${input.content.quote}.`;
  if (needs.has("location")) return `موقعنا في ${input.content.location}.`;
  if (needs.has("whatsapp") && needs.has("price")) {
    return `الأسعار الحالية: ${input.content.pricing}. وبالنسبة لواتساب، ${input.content.whatsapp}`;
  }
  if (needs.has("whatsapp")) return input.content.whatsapp;
  if (needs.has("how_it_works")) return input.content.howItWorks;
  if (needs.has("service")) return `نقدم خدمة تساعدك على إدارة محادثات العملاء والردود والمتابعة. ${input.content.howItWorks}`;
  if (needs.has("custom_quote_handoff")) return input.content.handoff;
  if (needs.has("objection")) return `${facts}أتفهم ملاحظتك. الأفضل نقيس السعر مقابل الوقت والضغط الذي يقلله النظام، وليس كرقم فقط.`;
  if (needs.has("value")) return `${facts}النظام يرتب المحادثات والأسئلة المتكررة، يوفر وقتك، ويقلل الضغط حتى تركز على العملاء الجاهزين.`;
  if (needs.has("qualification_question")) return qualificationFallback(input.contract.nextAction);
  if (needs.has("start_cta")) return "ممتاز، نقدر نبدأ بخطوة بسيطة: نراجع بيانات الشركة والخدمة المطلوبة ثم نجهز المساعد على نفس المعلومات.";
  if (needs.has("clarification")) return "ما فهمت قصدك تمامًا. ممكن توضحها بجملة قصيرة؟";

  return "خلني أوضحها بشكل أبسط: أقدر أساعدك في تنظيم محادثات العملاء وتحويل المهتمين إلى متابعة واضحة.";
}

function qualificationFallback(nextAction: string) {
  if (nextAction === "ASK_MESSAGES_PER_DAY") return "النظام يساعد على ترتيب محادثات العملاء وتسريع الردود. تقريبًا كم رسالة تستقبلون يوميًا؟";
  if (nextAction === "ASK_TEAM_SIZE") return "ممتاز، هذا يعطينا صورة عن حجم المحادثات. من يرد على العملاء حاليًا؟";
  if (nextAction === "CONFIRM_PROBLEM") return "هل تواجهون تأخير في الرد أو ضغط واضح وقت الزحمة؟";
  return "ما الخطوة التي تفضل أن نوضحها لك الآن؟";
}
