const labels: Record<string, string> = {
  ASK_QUALIFYING_QUESTION: "اسأل سؤالًا للتأهيل",
  ASK_MESSAGES_PER_DAY: "اسأل عن عدد الرسائل",
  ASK_TEAM_SIZE: "اسأل عن حجم الفريق",
  CONFIRM_PROBLEM: "تأكيد المشكلة",
  EXPLAIN_VALUE: "شرح قيمة الحل",
  PRESENT_VALUE_OR_OFFER: "عرض السعر",
  ANSWER_DIRECTLY: "أجب مباشرة",
  PRESENT_OFFER: "اعرض الباقة",
  BOOKING: "حجز موعد",
  FOLLOW_UP: "متابعة",
  HUMAN_HANDOFF: "تحويل لموظف",
  DISQUALIFY: "غير مناسب",
  QUALIFY: "تأهيل العميل",
  DIRECT_ANSWER: "رد مباشر",
  QUALIFIED: "مؤهل",
  NEEDS_REVIEW: "يحتاج مراجعة",
  DISCOVERING: "قيد التأهيل",
  UNKNOWN: "غير محدد",
  PROPOSAL_SENT: "تم إرسال العرض",
  CHECK_DECISION: "مراجعة قرار العميل",
  RECOVER_OBJECTION: "معالجة اعتراض",
  NEGOTIATION: "قيد التفاوض",
  WON: "فازت",
  LOST: "خسرت",
  OPEN: "مفتوحة",
  WEB_CHAT: "محادثة الموقع",
  WHATSAPP: "واتساب",
  EMAIL: "البريد الإلكتروني",
  INSTAGRAM: "إنستغرام",
  FACEBOOK: "فيسبوك",
  PHONE: "اتصال",
  NEW: "جديد",
  DISCOVERY: "اكتشاف الاحتياج",
  QUALIFICATION: "تأهيل",
  OFFER: "عرض",
  FOLLOW_UP_STAGE: "متابعة",
  Hot: "أولوية عالية",
  Warm: "يحتاج متابعة",
  Cold: "أولوية منخفضة",
  Unqualified: "غير مؤهل",
  Lost: "خاسر",
  "General Inquiry": "استفسار عام",
  "Price Inquiry": "سؤال عن السعر",
  Objection: "اعتراض",
  Greeting: "تحية",
  "Booking Intent": "يريد حجز موعد",
  "Human Request": "طلب تواصل مباشر",
};

export function uiLabel(value?: string | null) {
  if (!value) return "غير محدد";
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function channelLabel(value?: string | null) {
  return uiLabel(value);
}

export function statusLabel(value?: string | null) {
  return uiLabel(value);
}
