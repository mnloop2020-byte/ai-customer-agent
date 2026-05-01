"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

type KnowledgeDocumentStatus = "CURRENT" | "ARCHIVED" | "DRAFT";
type KnowledgeSourceType = "PDF" | "TEXT";

type KnowledgeDocumentRow = {
  id: string;
  title: string;
  status: KnowledgeDocumentStatus;
  sourceName: string | null;
  updatedAt: string;
  chunkCount: number;
};

type UploadPreview = {
  title: string;
  sourceName: string | null;
  content: string;
  sourceType: KnowledgeSourceType;
  originalFilename: string;
};

const text = {
  saveError:
    "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u062a\u0646\u062f. \u062a\u0623\u0643\u062f \u0623\u0646 \u0627\u0644\u0646\u0635 \u0644\u0627 \u064a\u0642\u0644 \u0639\u0646 20 \u062d\u0631\u0641\u0627.",
  updateError:
    "\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062b \u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0633\u062a\u0646\u062f.",
  deleteError:
    "\u062a\u0639\u0630\u0631 \u062d\u0630\u0641 \u0627\u0644\u0645\u0633\u062a\u0646\u062f.",
  documentsTitle: "مصادر المعرفة المعتمدة",
  documentsHint:
    "المساعد يستخدم المصادر المعتمدة فقط للإجابة على العملاء. يمكنك إضافة نص مباشر أو رفع ملف ومراجعته قبل الاعتماد.",
  directText: "\u0646\u0635 \u0645\u0628\u0627\u0634\u0631",
  approve: "\u0627\u0639\u062a\u0645\u0627\u062f",
  archive: "\u0623\u0631\u0634\u0641\u0629",
  delete: "\u062d\u0630\u0641",
  emptyState:
    "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0639\u0631\u0641\u0629 \u0645\u0636\u0627\u0641\u0629 \u0628\u0639\u062f. \u0623\u0636\u0641 \u0623\u0648\u0644 \u0645\u0633\u062a\u0646\u062f \u0645\u0646 \u0627\u0644\u0644\u0648\u062d\u0629 \u0627\u0644\u062c\u0627\u0646\u0628\u064a\u0629.",
  addTitle: "إضافة مصدر جديد",
  titleLabel: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0633\u062a\u0646\u062f",
  titlePlaceholder: "\u0645\u062b\u0627\u0644: \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629",
  sourceLabel: "\u0627\u0644\u0645\u0635\u062f\u0631",
  optional: "\u0627\u062e\u062a\u064a\u0627\u0631\u064a",
  contentLabel: "\u0627\u0644\u0646\u0635",
  contentPlaceholder:
    "\u0636\u0639 \u0647\u0646\u0627 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629\u060c \u0633\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u0623\u0633\u0639\u0627\u0631\u060c \u0634\u0631\u0648\u0637 \u0627\u0644\u062e\u062f\u0645\u0629\u060c \u0623\u0648 \u0625\u062c\u0627\u0628\u0627\u062a \u0627\u0644\u062f\u0639\u0645...",
  saveKnowledge: "اعتماد المصدر",
  uploadTitle: "\u0631\u0641\u0639 \u0645\u0644\u0641",
  uploadHint:
    "\u064a\u0645\u0643\u0646\u0643 \u0631\u0641\u0639 PDF \u0623\u0648 TXT \u0644\u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0627\u0644\u0646\u0635 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u060c \u062b\u0645 \u0645\u0631\u0627\u062c\u0639\u062a\u0647 \u0642\u0628\u0644 \u0627\u0644\u062d\u0641\u0638.",
  chooseFile: "\u0627\u062e\u062a\u0631 \u0645\u0644\u0641 PDF \u0623\u0648 TXT",
  noFileSelected: "\u0644\u0645 \u064a\u062a\u0645 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0644\u0641 \u0628\u0639\u062f",
  uploadKnowledge: "\u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641",
  uploadSuccessTitleFallback: "\u0645\u0633\u062a\u0646\u062f \u0645\u0631\u0641\u0648\u0639",
  uploadUnsupported:
    "\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0641 \u063a\u064a\u0631 \u0645\u062f\u0639\u0648\u0645. \u0627\u0633\u062a\u062e\u062f\u0645 PDF \u0623\u0648 TXT.",
  uploadTooLarge:
    "\u062d\u062c\u0645 \u0627\u0644\u0645\u0644\u0641 \u0643\u0628\u064a\u0631 \u062c\u062f\u0627. \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u0642\u0635\u0649 10 \u0645\u064a\u062c\u0627.",
  uploadEmpty:
    "\u0627\u0644\u0645\u0644\u0641 \u0641\u0627\u0631\u063a \u0623\u0648 \u0644\u0627 \u064a\u062d\u062a\u0648\u064a \u0646\u0635\u0627 \u0642\u0627\u0628\u0644\u0627 \u0644\u0644\u0627\u0633\u062a\u062e\u0631\u0627\u062c.",
  uploadFailed:
    "\u062a\u0639\u0630\u0631 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641 \u0623\u0648 \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0627\u0644\u0646\u0635 \u0645\u0646\u0647.",
  previewReady:
    "\u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629 \u062c\u0627\u0647\u0632\u0629. \u0631\u0627\u062c\u0639 \u0627\u0644\u0646\u0635 \u0648\u0639\u062f\u0644\u0647 \u062b\u0645 \u0627\u062d\u0641\u0638\u0647.",
  extractPreview:
    "\u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0648\u0645\u0639\u0627\u064a\u0646\u0629",
  previewTitle:
    "\u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u0633\u062a\u062e\u0631\u062c",
  previewHint:
    "\u0647\u0630\u0627 \u0627\u0644\u0646\u0635 \u0633\u064a\u062a\u062d\u0648\u0644 \u0625\u0644\u0649 \u0648\u062b\u064a\u0642\u0629 \u0645\u0639\u0631\u0641\u0629 \u0628\u0639\u062f \u0645\u0631\u0627\u062c\u0639\u062a\u0643 \u0644\u0647.",
  previewSourceType:
    "\u0646\u0648\u0639 \u0627\u0644\u0645\u0635\u062f\u0631",
  saveReviewedDocument:
    "\u062d\u0641\u0638 \u0628\u0639\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629",
  clearPreview:
    "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629",
  previewEmpty:
    "\u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u0633\u062a\u062e\u0631\u062c \u0641\u0627\u0631\u063a. \u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0644\u0641 \u0623\u0648 \u062c\u0631\u0628 \u0645\u0644\u0641\u0627 \u0622\u062e\u0631.",
};

const statusLabels: Record<KnowledgeDocumentStatus, string> = {
  CURRENT: "\u0645\u0639\u062a\u0645\u062f",
  ARCHIVED: "\u0645\u0624\u0631\u0634\u0641",
  DRAFT: "\u0645\u0633\u0648\u062f\u0629",
};

const statusStyles: Record<KnowledgeDocumentStatus, string> = {
  CURRENT: "border-emerald-100 bg-emerald-50 text-emerald-700",
  ARCHIVED: "border-slate-200 bg-slate-50 text-slate-600",
  DRAFT: "border-amber-100 bg-amber-50 text-amber-700",
};

export function KnowledgeWorkspace({ documents }: { documents: KnowledgeDocumentRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [content, setContent] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSourceName, setUploadSourceName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function createDocument() {
    if (!title.trim() || !content.trim() || pending) return;

    setError("");

    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        sourceName: sourceName || undefined,
        content,
        status: "CURRENT",
      }),
    });

    if (!response.ok) {
      setError(text.saveError);
      return;
    }

    setTitle("");
    setSourceName("");
    setContent("");
    startTransition(() => router.refresh());
  }

  async function extractPreview() {
    if (!selectedFile || pending) return;

    setError("");

    const formData = new FormData();
    formData.set("file", selectedFile);
    formData.set(
      "title",
      uploadTitle.trim() || filenameWithoutExtension(selectedFile.name) || text.uploadSuccessTitleFallback,
    );
    formData.set("sourceName", uploadSourceName.trim() || selectedFile.name);
    formData.set("status", "CURRENT");
    formData.set("mode", "preview");

    const response = await fetch("/api/knowledge", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(mapUploadError(payload?.error));
      return;
    }

    const payload = (await response.json()) as { preview?: UploadPreview };

    if (!payload.preview?.content?.trim()) {
      setError(text.previewEmpty);
      return;
    }

    setPreview(payload.preview);
  }

  async function savePreviewDocument() {
    if (!preview || !preview.title.trim() || preview.content.trim().length < 20 || pending) return;

    setError("");

    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: preview.title,
        sourceName: preview.sourceName || preview.originalFilename || undefined,
        content: preview.content,
        status: "CURRENT",
      }),
    });

    if (!response.ok) {
      setError(text.saveError);
      return;
    }

    setUploadTitle("");
    setUploadSourceName("");
    setSelectedFile(null);
    clearPreview();
    startTransition(() => router.refresh());
  }

  function clearPreview() {
    setPreview(null);
  }

  async function updateStatus(documentId: string, status: KnowledgeDocumentStatus) {
    if (pending) return;

    setError("");

    const response = await fetch(`/api/knowledge/${documentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setError(text.updateError);
      return;
    }

    startTransition(() => router.refresh());
  }

  async function deleteDocument(documentId: string) {
    if (pending) return;

    setError("");

    const response = await fetch(`/api/knowledge/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(text.deleteError);
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold">{text.documentsTitle}</h3>
          <p className="mt-1 text-sm text-slate-500">{text.documentsHint}</p>
        </div>

        <div className="divide-y divide-slate-100">
          {documents.length ? (
            documents.map((document) => (
              <article
                key={document.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <FileText size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{document.title}</h4>
                      <StatusPill status={document.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {sourceTypeLabel(document)} {" - "} آخر تحديث: {document.updatedAt} {" - "} بواسطة فريق المبيعات
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {document.status !== "CURRENT" ? (
                    <button
                      onClick={() => updateStatus(document.id, "CURRENT")}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <CheckCircle2 size={16} aria-hidden="true" />
                      {text.approve}
                    </button>
                  ) : null}
                  {document.status !== "ARCHIVED" ? (
                    <button
                      onClick={() => updateStatus(document.id, "ARCHIVED")}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      <Archive size={16} aria-hidden="true" />
                      {text.archive}
                    </button>
                  ) : null}
                  <button
                    onClick={() => {
                      if (window.confirm("هل أنت متأكد من حذف هذا المصدر؟")) {
                        deleteDocument(document.id);
                      }
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    {text.delete}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="p-8 text-center text-sm leading-7 text-slate-500">
              {text.emptyState}
            </div>
          )}
        </div>
      </section>

      <aside className="app-card p-5">
        <div className="flex items-center gap-2">
          <Plus size={18} className="text-teal-700" aria-hidden="true" />
          <h3 className="font-semibold">{text.addTitle}</h3>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{text.titleLabel}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="field-shell mt-2 h-11 w-full rounded-xl px-3 text-sm outline-none"
              placeholder={text.titlePlaceholder}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{text.sourceLabel}</span>
            <input
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              className="field-shell mt-2 h-11 w-full rounded-xl px-3 text-sm outline-none"
              placeholder={text.optional}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{text.contentLabel}</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="field-shell mt-2 min-h-56 w-full resize-y rounded-xl p-3 text-sm leading-7 outline-none"
              placeholder={text.contentPlaceholder}
            />
          </label>
          <button
            onClick={createDocument}
            disabled={pending || !title.trim() || content.trim().length < 20}
            className="btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={17} aria-hidden="true" />
            {text.saveKnowledge}
          </button>
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-teal-700" aria-hidden="true" />
            <h3 className="font-semibold">{text.uploadTitle}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{text.uploadHint}</p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-medium">{text.titleLabel}</span>
              <input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                className="field-shell mt-2 h-11 w-full rounded-xl px-3 text-sm outline-none"
                placeholder={text.titlePlaceholder}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{text.sourceLabel}</span>
              <input
                value={uploadSourceName}
                onChange={(event) => setUploadSourceName(event.target.value)}
                className="field-shell mt-2 h-11 w-full rounded-xl px-3 text-sm outline-none"
                placeholder={text.optional}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{text.chooseFile}</span>
              <input
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                }}
                className="field-shell mt-2 block h-12 w-full rounded-xl px-3 py-3 text-sm outline-none file:me-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-teal-700"
              />
            </label>
            <p className="text-sm text-slate-500">{selectedFile ? selectedFile.name : text.noFileSelected}</p>
            <button
              onClick={extractPreview}
              disabled={pending || !selectedFile}
              className="btn-secondary inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={17} aria-hidden="true" />
              {text.extractPreview}
            </button>
          </div>
        </div>

        {preview ? (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{text.previewTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{text.previewHint}</p>
              </div>
              <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                {text.previewSourceType}: {preview.sourceType}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {text.previewReady}
              </div>
              <label className="block">
                <span className="text-sm font-medium">{text.titleLabel}</span>
                <input
                  value={preview.title}
                  onChange={(event) =>
                    setPreview((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                  className="field-shell mt-2 h-11 w-full rounded-xl px-3 text-sm outline-none"
                  placeholder={text.titlePlaceholder}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{text.sourceLabel}</span>
                <input
                  value={preview.sourceName ?? ""}
                  onChange={(event) =>
                    setPreview((current) =>
                      current ? { ...current, sourceName: event.target.value } : current,
                    )
                  }
                  className="field-shell mt-2 h-11 w-full rounded-xl px-3 text-sm outline-none"
                  placeholder={text.optional}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{text.contentLabel}</span>
                <textarea
                  value={preview.content}
                  onChange={(event) =>
                    setPreview((current) =>
                      current ? { ...current, content: event.target.value } : current,
                    )
                  }
                  className="field-shell mt-2 min-h-72 w-full resize-y rounded-xl p-3 text-sm leading-7 outline-none"
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={savePreviewDocument}
                  disabled={pending || !preview.title.trim() || preview.content.trim().length < 20}
                  className="btn-primary inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 size={17} aria-hidden="true" />
                  {text.saveReviewedDocument}
                </button>
                <button
                  onClick={clearPreview}
                  disabled={pending}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {text.clearPreview}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function StatusPill({ status }: { status: KnowledgeDocumentStatus }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function sourceTypeLabel(document: KnowledgeDocumentRow) {
  const textValue = `${document.title} ${document.sourceName ?? ""}`.toLowerCase();
  if (textValue.includes("سعر") || textValue.includes("price")) return "أسعار";
  if (textValue.includes("faq") || textValue.includes("سؤال") || textValue.includes("أسئلة")) return "أسئلة شائعة";
  if (textValue.includes("سياسة") || textValue.includes("policy")) return "سياسة الخدمة";
  if (textValue.includes("شرط") || textValue.includes("terms")) return "شروط الاستخدام";
  return document.sourceName ?? text.directText;
}

function filenameWithoutExtension(filename: string) {
  const trimmed = filename.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
}

function mapUploadError(error?: string) {
  if (error === "UNSUPPORTED_FILE_TYPE") return text.uploadUnsupported;
  if (error === "FILE_TOO_LARGE") return text.uploadTooLarge;
  if (error === "EMPTY_FILE") return text.uploadEmpty;
  return text.uploadFailed;
}
