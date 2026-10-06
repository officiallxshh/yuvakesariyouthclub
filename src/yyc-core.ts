/* YYC typed core — additive, browser-safe utilities for critical data flows. */

interface YYCMemberRecord {
  name?: unknown;
  position?: unknown;
  role?: unknown;
  role_number?: unknown;
  phone?: unknown;
  email?: unknown;
  dob?: unknown;
  photo_url?: unknown;
  photo_data?: unknown;
  approved?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

interface YYCCoreApi {
  normalizeMember(input?: YYCMemberRecord): YYCMemberRecord;
  isApproved(input?: YYCMemberRecord): boolean;
  normalizeRoleNumber(value: unknown): string;
  buildVerifyUrl(roleNumber: unknown, baseUrl?: string): string;
  getPhotoUrl(input?: YYCMemberRecord): string;
}

declare global {
  interface Window {
    YYCCore?: YYCCoreApi;
  }
}

(function installYYCCore(): void {
  const text = (value: unknown, fallback = ""): string => {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
  };

  const normalizeRoleNumber = (value: unknown): string => {
    const raw = text(value);
    return raw || "PENDING";
  };

  const isApproved = (input: YYCMemberRecord = {}): boolean => {
    const status = text(input.status).toLowerCase();
    if (status === "approved" || status === "active") return true;
    if (input.approved === true) return true;
    return Boolean(text(input.role_number));
  };

  const normalizeMember = (input: YYCMemberRecord = {}): YYCMemberRecord => {
    const output: YYCMemberRecord = { ...input };
    output.name = text(input.name, "YYC Member");
    output.position = text(input.position, "MEMBER");
    output.role = text(input.role, "LEADER");
    output.role_number = normalizeRoleNumber(input.role_number);
    output.phone = text(input.phone, "Phone not provided");
    output.email = text(input.email, "Email not provided");
    output.dob = text(input.dob, "—");
    output.photo_url = text(input.photo_url, "assets/yyc-logo-clean.webp");
    output.status = text(input.status, input.approved === true ? "approved" : "");
    return output;
  };

  const buildVerifyUrl = (roleNumber: unknown, baseUrl = window.location.href): string => {
    const url = new URL("verify.html", baseUrl);
    url.searchParams.set("uid", normalizeRoleNumber(roleNumber));
    return url.href;
  };

  const getPhotoUrl = (input: YYCMemberRecord = {}): string =>
    text(input.photo_url, text(input.photo_data, "assets/yyc-logo-clean.webp"));

  window.YYCCore = {
    normalizeMember,
    isApproved,
    normalizeRoleNumber,
    buildVerifyUrl,
    getPhotoUrl
  };
})();

export {};
