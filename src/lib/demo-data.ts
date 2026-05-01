export const kpis = [
  { label: "عملاء جدد", value: "128", change: "+18%", tone: "text-emerald-700" },
  { label: "Hot Leads", value: "34", change: "+11%", tone: "text-rose-700" },
  { label: "مواعيد محجوزة", value: "21", change: "+7%", tone: "text-indigo-700" },
  { label: "معدل التحويل", value: "16.4%", change: "+3.2%", tone: "text-amber-700" },
];

export type DemoLead = {
  id: string;
  name: string;
  company?: string;
  channel: string;
  intent: string;
  score: number;
  status: "Hot" | "Warm" | "Cold" | "Unqualified";
  service: string;
  budget: string;
  timeline: string;
  owner: string;
  next: string;
};

export const leads: DemoLead[] = [
  {
    id: "lead-001",
    name: "سارة العلي",
    company: "شركة مدار التقنية",
    channel: "Web Chat",
    intent: "Booking Intent",
    score: 92,
    status: "Hot",
    service: "AI Sales Agent",
    budget: "2,000 - 5,000 USD",
    timeline: "خلال أسبوعين",
    owner: "ريم",
    next: "حجز Demo",
  },
  {
    id: "lead-002",
    name: "ليان العبدالله",
    channel: "WhatsApp",
    intent: "Price Inquiry",
    score: 67,
    status: "Warm",
    service: "Web Chat Agent",
    budget: "غير محدد",
    timeline: "هذا الشهر",
    owner: "خالد",
    next: "إرسال مقارنة عروض",
  },
  {
    id: "lead-003",
    name: "د. نادر",
    company: "عيادة النخبة",
    channel: "Instagram",
    intent: "Objection",
    score: 58,
    status: "Warm",
    service: "Appointment Agent",
    budget: "1,000 - 2,000 USD",
    timeline: "قريبًا",
    owner: "ريم",
    next: "معالجة اعتراض السعر",
  },
  {
    id: "lead-004",
    name: "أحمد الخطيب",
    channel: "Email",
    intent: "General Inquiry",
    score: 31,
    status: "Cold",
    service: "CRM Automation",
    budget: "غير واضح",
    timeline: "مرحلة بحث",
    owner: "غير معين",
    next: "Follow-up بعد 24 ساعة",
  },
];

export const conversations = [
  {
    id: "conv-001",
    lead: "شركة مدار التقنية",
    channel: "Web Chat",
    score: 92,
    status: "Hot",
    lastMessage: "نحتاج Demo لفريق من 20 شخص خلال أسبوعين.",
    decision: "Booking Intent",
    action: "عرض موعد",
    time: "منذ 3 دقائق",
    messages: [
      { sender: "customer", body: "نحتاج Demo لفريق من 20 شخص خلال أسبوعين.", time: "10:21" },
      { sender: "ai", body: "ممتاز. لدينا موعد متاح غدًا الساعة 11 صباحًا أو 3 عصرًا، أيهما يناسبكم؟", time: "10:21" },
    ],
  },
  {
    id: "conv-002",
    lead: "ليان العبدالله",
    channel: "WhatsApp",
    score: 67,
    status: "Warm",
    lastMessage: "كم سعر الباقة المتوسطة؟",
    decision: "Price Inquiry",
    action: "سؤال تأهيلي",
    time: "منذ 14 دقيقة",
    messages: [
      { sender: "customer", body: "كم سعر الباقة المتوسطة؟", time: "10:10" },
      { sender: "ai", body: "أقدر أوضح السعر بدقة. هل الاستخدام لك شخصيًا أم لجهة عمل؟", time: "10:10" },
    ],
  },
  {
    id: "conv-003",
    lead: "عيادة النخبة",
    channel: "Instagram",
    score: 58,
    status: "Warm",
    lastMessage: "السعر أعلى من المتوقع.",
    decision: "Objection",
    action: "توضيح القيمة",
    time: "منذ 28 دقيقة",
    messages: [
      { sender: "customer", body: "السعر أعلى من المتوقع.", time: "09:56" },
      { sender: "ai", body: "أتفهمك. هل تفضلون خيارًا أقل تكلفة أم توضيح الفرق في العائد بين الخيارات؟", time: "09:56" },
    ],
  },
];

export const workflowSteps = [
  "استقبال الرسالة",
  "تحديد العميل",
  "فهم النية",
  "استخراج البيانات",
  "تحديث CRM",
  "حساب Score",
  "اختيار الإجراء",
  "إرسال الرد أو التصعيد",
];

export const roadmap = [
  { title: "MVP", status: "قيد البناء", items: "Dashboard, Leads, Inbox, AI Workflow" },
  { title: "Automation", status: "التالي", items: "Follow-ups, Handoff, Calendar" },
  { title: "Integrations", status: "لاحقًا", items: "WhatsApp, Email, Payments" },
];

export const services = [
  {
    name: "AI Sales Agent",
    price: "من 299 USD شهريًا",
    rules: "B2B, Demo, حجز مكالمة، تأهيل ميزانية وجدول زمني",
  },
  {
    name: "Appointment Agent",
    price: "من 149 USD شهريًا",
    rules: "عيادات وخدمات، حجز موعد، تذكير، إعادة جدولة",
  },
  {
    name: "CRM Automation",
    price: "حسب عدد المستخدمين",
    rules: "Follow-ups, Scoring, Handoff, تقارير",
  },
];

export const routingRules = [
  { condition: "Score أعلى من 80", action: "حجز موعد أو Demo مباشرة" },
  { condition: "طلب مندوب بشري", action: "تصعيد فوري مع ملخص المحادثة" },
  { condition: "اعتراض سعر", action: "رد قيمة ثم خيار أقل تكلفة" },
  { condition: "لم يرد خلال 24 ساعة", action: "Follow-up ناعم مع CTA واضح" },
];
