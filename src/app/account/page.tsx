import { AppShell } from "@/components/app-shell";
import { ChangePasswordForm } from "@/components/change-password-form";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AccountPage() {
  const user = await getCurrentUser();

  return (
    <AppShell>
      <PageHeader eyebrow="إعدادات الحساب" title="الحساب" />

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="app-card p-5">
          <h3 className="font-semibold">بيانات المستخدم</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Info label="الاسم" value={user?.name ?? "-"} />
            <Info label="الإيميل" value={user?.email ?? "-"} />
            <Info label="الصلاحية" value={user?.role ?? "-"} />
          </div>
        </div>

        <ChangePasswordForm />
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

