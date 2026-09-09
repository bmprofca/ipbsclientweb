/** Store/dial 0 + 10 digits. Agents type only the 10-digit number. */
export function normalizeLocalNumber(value: string) {
  let digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("091") && digits.length === 13) digits = digits.slice(3);
  if (digits.length === 11 && digits.startsWith("0")) return digits;
  if (digits.length === 10) return `0${digits}`;
  if (digits.length > 10) {
    const last10 = digits.slice(-10);
    return `0${last10}`;
  }
  return digits;
}

/** Login / registration unique id: last 10 digits, or a legacy id such as `admin`. */
export function authMobileKey(value: string) {
  const trimmed = String(value || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return trimmed.toLowerCase();
}

export function isTenDigitMobile(value: string) {
  return /^\d{10}$/.test(authMobileKey(value));
}

/** 10 digits for the form (strips a leading 0). */
export function localNumberInput(value: string) {
  const normalized = normalizeLocalNumber(value);
  if (normalized.length === 11 && normalized.startsWith("0")) return normalized.slice(1);
  return String(value || "").replace(/[^\d]/g, "").slice(0, 10);
}

export function phoneMatchKey(value: string) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/** Pull a dialable number out of SIP URIs, caller-id strings, or raw digits. */
export function extractCallerPhone(value: string) {
  let s = String(value || "").trim();
  if (!s) return "";
  const angled = s.match(/<([^>]+)>/);
  if (angled) s = angled[1].trim();
  s = s.replace(/^sips?:/i, "");
  const user = s.split("@")[0].split(";")[0].trim();
  return normalizeLocalNumber(user);
}

export function extractCallerName(value: string) {
  const s = String(value || "").trim();
  if (!s) return "";
  const quoted = s.match(/^"([^"]+)"/);
  if (quoted) return quoted[1].trim();
  if (s.includes("<")) {
    const name = s.split("<")[0].replace(/"/g, "").trim();
    if (name && !/^\+?\d[\d\s-]*$/.test(name)) return name;
  }
  return "";
}

export function callerFromPbxPayload(p: Record<string, unknown>) {
  const numberKeys = [
    "from",
    "caller",
    "src",
    "cid_num",
    "callerid",
    "caller_id_number",
    "cidnum",
    "number",
    "ani",
  ];
  let phone = "";
  let name = "";
  for (const key of numberKeys) {
    if (p[key] == null) continue;
    const raw = String(p[key]);
    const parsedName = extractCallerName(raw);
    if (parsedName) name = name || parsedName;
    const parsedPhone = extractCallerPhone(raw);
    const match = phoneMatchKey(parsedPhone);
    if (match.length >= 8 && !phone) phone = parsedPhone;
    else if (!phone && parsedPhone) phone = parsedPhone;
  }
  const nameKeys = [
    "calleridname",
    "cid_name",
    "caller_name",
    "displayname",
    "display_name",
    "cidname",
    "name",
  ];
  for (const key of nameKeys) {
    const raw = String(p[key] || "").trim();
    if (raw && !/^\+?\d[\d\s-]*$/.test(raw)) {
      name = name || raw;
      break;
    }
  }
  return { phone, name };
}

export function renderVoiceScript(
  template: string,
  vars: { name?: string; company?: string; phone?: string; notes?: string; email?: string },
) {
  const map: Record<string, string> = {
    name: vars.name || "",
    company: vars.company || "",
    phone: vars.phone || "",
    notes: vars.notes || "",
    email: vars.email || "",
  };
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return map[key.toLowerCase()] ?? "";
  });
}

export const DEFAULT_VOICE_KEYS = [
  { digit: "1", label: "Interested", disposition: "interested" },
  { digit: "2", label: "Callback", disposition: "callback" },
  { digit: "3", label: "Not interested", disposition: "not_interested" },
  { digit: "9", label: "Repeat message", disposition: "repeat" },
] as const;

export const ROLES = ["owner", "admin", "supervisor", "agent"] as const;
export const ALL_ROLES = ["super_admin", ...ROLES] as const;
export type Role = (typeof ALL_ROLES)[number];

export const PRODUCT_ROLES = {
  SUPER_ADMIN: "super_admin",
  TENANT_ADMIN: "admin",
  SUPERVISOR: "supervisor",
  AGENT: "agent",
} as const;

export function isTenantAdmin(role: string) {
  return role === "super_admin" || role === "owner" || role === "admin";
}

export function isSupervisor(role: string) {
  return isTenantAdmin(role) || role === "supervisor";
}

export const PBX_MODES = ["mock", "onyx", "mqtt"] as const;
export type PbxMode = (typeof PBX_MODES)[number];

/** Active endpoint for a mapped SIP extension. Both devices may exist; only one is used. */
export const PHONE_MODES = ["desk", "sip"] as const;
export type PhoneMode = (typeof PHONE_MODES)[number];

export function phoneModeLabel(mode?: string) {
  return mode === "sip" ? "Softphone" : "Hard phone";
}

export const CALL_STATES = [
  "originating",
  "ringing",
  "answered",
  "ended",
  "failed",
] as const;
export type CallState = (typeof CALL_STATES)[number];

export type AuthUser = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  extension: string;
  isActive: boolean;
  sipPasswordSet?: boolean;
  phoneMode?: PhoneMode;
};

export type LiveCall = {
  uuid: string;
  orgId: string;
  userId?: string;
  direction: "inbound" | "outbound" | "internal";
  from: string;
  to: string;
  state: CallState;
  duration: number;
  muted: boolean;
  agentExtension?: string;
  startedAt: string;
};

export type CdrRecord = {
  id: string;
  uuid: string;
  direction: string;
  from: string;
  to: string;
  state: string;
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  duration: number;
  billsec: number;
  hangupCause: string;
  agentName?: string | null;
  agentExtension?: string | null;
};

export type ClickToCallRequest = {
  phone: string;
  crmContactId?: string;
  userEmail?: string;
  extension?: string;
  mode?: "extension" | "number" | "ivr";
  ivr?: string;
};

export type CrmWebhookPayload = {
  event: "invite" | "answered" | "hangup" | "click_to_call";
  from: string;
  to: string;
  callId: string;
  agentExtension?: string;
  agentEmail?: string;
  crmContactId?: string;
  direction?: string;
  at: string;
  reason?: string;
  stickyExtension?: string;
};
