import nodemailer from "nodemailer";

type SendAutomationEmailInput = {
  to: string;
  customerName?: string | null;
  companyName: string;
  subject: string;
  message: string;
};

let transporterCache: nodemailer.Transporter | null = null;

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_PORT?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM_EMAIL?.trim(),
  );
}

export async function sendAutomationEmail(input: SendAutomationEmailInput) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured.");
  }

  const transporter = getTransporter();
  const fromName = process.env.SMTP_FROM_NAME?.trim() || input.companyName;
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();

  if (!fromEmail) {
    throw new Error("SMTP_FROM_EMAIL is required.");
  }

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: input.to,
    subject: input.subject,
    text: buildPlainText(input),
    html: buildHtml(input),
  });
}

function getTransporter() {
  if (transporterCache) return transporterCache;

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP credentials are incomplete.");
  }

  transporterCache = nodemailer.createTransport({
    host,
    port,
    secure: readSecureFlag(),
    auth: {
      user,
      pass,
    },
  });

  return transporterCache;
}

function readSecureFlag() {
  const raw = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (!raw) return Number(process.env.SMTP_PORT) === 465;
  return raw === "true" || raw === "1" || raw === "yes";
}

function buildPlainText(input: SendAutomationEmailInput) {
  return [
    `Hello ${input.customerName || "there"},`,
    "",
    input.message,
    "",
    `Regards,`,
    input.companyName,
  ].join("\n");
}

function buildHtml(input: SendAutomationEmailInput) {
  const greeting = input.customerName ? `Hello ${escapeHtml(input.customerName)},` : "Hello,";
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.7;">
      <p>${greeting}</p>
      <p>${escapeHtml(input.message)}</p>
      <p style="margin-top: 20px;">Regards,<br />${escapeHtml(input.companyName)}</p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
