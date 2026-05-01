import { Download, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LeadsWorkspace } from "@/components/leads-workspace";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export default async function LeadsPage() {
  const user = await getCurrentUser();
  const [leads, services] = user
    ? await Promise.all([
        prisma.lead.findMany({
          where: { companyId: user.companyId },
          include: {
            service: true,
            conversations: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              include: {
                aiRuns: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.service.findMany({
          where: { companyId: user.companyId, isActive: true },
          orderBy: { createdAt: "asc" },
        }),
      ])
    : [[], []];

  const rows = leads.map((lead) => {
    const latestRun = lead.conversations[0]?.aiRuns[0];
    const meta = readRunMeta(latestRun?.extractedData);

    return {
      id: lead.id,
      name: lead.fullName ?? "زائر محادثة الموقع",
      company: lead.companyName ?? undefined,
      channel: lead.channel,
      intent: lead.intent ?? "General Inquiry",
      score: lead.score,
      status: displayStatus(lead.status),
      service: lead.service?.name ?? "-",
      budget: lead.budget ?? "غير محدد",
      timeline: lead.timeline ?? "غير محدد",
      route: lead.route ?? "QUALIFY",
      qualification: lead.qualificationStatus ?? "UNKNOWN",
      stage: lead.buyingStage ?? "NEW",
      missing: Array.isArray(lead.missingFields)
        ? lead.missingFields.map((field) => String(field)).join(", ")
        : "-",
      recommendedOffer: meta.recommendedOffer || "-",
      followUpKind: meta.followUpKind || "-",
      lostReason: lead.lostReason ?? meta.lostReason ?? "-",
      reEngagement: meta.reEngageAfterDays ? `${meta.reEngageAfterDays} days` : "-",
      next: nextAction(lead.status),
    };
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="إدارة العملاء المحتملين"
        title="العملاء"
        actions={
          <>
            <button className="btn-secondary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium">
              <Download size={17} aria-hidden="true" />
              تصدير العملاء
            </button>
            <a href="/chat" className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium">
              <Plus size={17} aria-hidden="true" />
              عميل جديد
            </a>
          </>
        }
      />
      <LeadsWorkspace initialLeads={rows} services={services.map((service) => service.name)} />
    </AppShell>
  );
}

function displayStatus(status: string) {
  if (status === "HOT") return "Hot" as const;
  if (status === "WARM") return "Warm" as const;
  if (status === "COLD") return "Cold" as const;
  if (status === "LOST") return "Lost" as const;
  return "Unqualified" as const;
}

function nextAction(status: string) {
  if (status === "HOT") return "حجز موعد أو تحويل مباشر";
  if (status === "WARM") return "إرسال عرض ومتابعة";
  if (status === "COLD") return "متابعة لاحقة";
  if (status === "LOST") return "إعادة تفعيل إذا كانت مناسبة";
  return "تأهيل إضافي";
}

function readRunMeta(value: unknown) {
  if (!value || typeof value !== "object") {
    return { recommendedOffer: "", followUpKind: "", lostReason: "", reEngageAfterDays: 0 };
  }

  const recommendedOffer =
    "recommendedOffer" in value && value.recommendedOffer && typeof value.recommendedOffer === "object"
      ? [
          "offerName" in value.recommendedOffer ? String(value.recommendedOffer.offerName) : "",
          "price" in value.recommendedOffer ? String(value.recommendedOffer.price) : "",
        ]
          .filter(Boolean)
          .join(" - ")
      : "";

  const followUpKind =
    "followUpPlan" in value && value.followUpPlan && typeof value.followUpPlan === "object" && "kind" in value.followUpPlan
      ? String(value.followUpPlan.kind)
      : "";

  const lostReason =
    "lostDeal" in value && value.lostDeal && typeof value.lostDeal === "object" && "reason" in value.lostDeal
      ? String(value.lostDeal.reason)
      : "";

  const reEngageAfterDays =
    "lostDeal" in value &&
    value.lostDeal &&
    typeof value.lostDeal === "object" &&
    "reEngageAfterDays" in value.lostDeal &&
    Number.isFinite(Number(value.lostDeal.reEngageAfterDays))
      ? Number(value.lostDeal.reEngageAfterDays)
      : 0;

  return { recommendedOffer, followUpKind, lostReason, reEngageAfterDays };
}
