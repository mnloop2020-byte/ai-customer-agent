import { CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BookingsWorkspace } from "@/components/bookings-workspace";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  const [bookings, leads] = user
    ? await Promise.all([
        prisma.followUp.findMany({
          where: { companyId: user.companyId },
          include: { lead: true },
          orderBy: [{ dueAt: "asc" }, { stepNumber: "asc" }],
          take: 50,
        }),
        prisma.lead.findMany({
          where: { companyId: user.companyId },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
      ])
    : [[], []];

  return (
    <AppShell>
      <PageHeader
        eyebrow="مواعيد ومتابعات العملاء"
        title="المواعيد"
        actions={
          <a href="/leads" className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium">
            <CalendarCheck size={17} aria-hidden="true" />
            اختيار عميل
          </a>
        }
      />

      <BookingsWorkspace
        bookings={bookings.map((booking) => ({
          id: booking.id,
          lead: booking.lead.fullName ?? "زائر محادثة الموقع",
          kind: booking.kind,
          stepNumber: booking.stepNumber,
          message: booking.message,
          dueAt: formatDate(booking.dueAt),
          status: booking.status,
        }))}
        leads={leads.map((lead) => ({
          id: lead.id,
          name: lead.fullName ?? "زائر محادثة الموقع",
        }))}
      />
    </AppShell>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
