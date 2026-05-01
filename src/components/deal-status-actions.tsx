"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type DealStatus = "OPEN" | "PROPOSAL_SENT" | "NEGOTIATION" | "WON" | "LOST";

const options: Array<{ value: DealStatus; label: string }> = [
  { value: "WON", label: "فازت" },
  { value: "NEGOTIATION", label: "قيد التفاوض" },
  { value: "PROPOSAL_SENT", label: "بانتظار الرد" },
  { value: "LOST", label: "خسرت" },
];

export function DealStatusActions({ dealId, status }: { dealId: string; status: DealStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function updateStatus(nextStatus: DealStatus) {
    if (pending || nextStatus === status) return;
    if (nextStatus === "LOST" && !window.confirm("هل أنت متأكد من اعتبار الصفقة خاسرة؟")) return;

    setError("");
    setSuccess("");

    const response = await fetch("/api/deals/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId, status: nextStatus }),
    });

    if (!response.ok) {
      setError("تعذر تحديث الحالة.");
      return;
    }

    setSuccess("تم تحديث الحالة");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="relative inline-flex w-fit items-center">
        <select
          disabled={pending}
          defaultValue=""
          onChange={(event) => updateStatus(event.target.value as DealStatus)}
          className="btn-primary h-10 appearance-none rounded-md px-4 pe-9 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            تحديث الحالة
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute left-3 text-white" aria-hidden="true" />
      </label>
      {success ? <span className="text-xs font-medium text-emerald-600">{success}</span> : null}
      {error ? <span className="text-xs font-medium text-rose-600">{error}</span> : null}
    </div>
  );
}
