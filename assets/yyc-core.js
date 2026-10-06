/* YYC typed core — compiled browser artifact. Source: src/yyc-core.ts */
(function () {
  "use strict";
  function installYYCCore() {
    var text = function (value, fallback) {
      if (fallback === void 0) { fallback = ""; }
      if (value === null || value === undefined) return fallback;
      return String(value).trim() || fallback;
    };
    var normalizeRoleNumber = function (value) {
      var raw = text(value);
      return raw || "PENDING";
    };
    var isApproved = function (input) {
      if (input === void 0) { input = {}; }
      var status = text(input.status).toLowerCase();
      if (status === "approved" || status === "active") return true;
      if (input.approved === true) return true;
      return Boolean(text(input.role_number));
    };
    var normalizeMember = function (input) {
      if (input === void 0) { input = {}; }
      var output = Object.assign({}, input);
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
    var buildVerifyUrl = function (roleNumber, baseUrl) {
      if (baseUrl === void 0) { baseUrl = window.location.href; }
      var url = new URL("verify.html", baseUrl);
      url.searchParams.set("uid", normalizeRoleNumber(roleNumber));
      return url.href;
    };
    var getPhotoUrl = function (input) {
      if (input === void 0) { input = {}; }
      return text(input.photo_url, text(input.photo_data, "assets/yyc-logo-clean.webp"));
    };
    var buildIdCardPayload = function (input, kind, baseUrl) {
      if (input === void 0) { input = {}; }
      if (kind === void 0) { kind = "member"; }
      if (baseUrl === void 0) { baseUrl = window.location.href; }
      var member = normalizeMember(input);
      var roleNumber = normalizeRoleNumber(member.role_number);
      return {
        member: member,
        kind: kind,
        roleNumber: roleNumber,
        verifyUrl: buildVerifyUrl(roleNumber, baseUrl),
        photoUrl: getPhotoUrl(member)
      };
    };
    window.YYCCore = {
      normalizeMember: normalizeMember,
      isApproved: isApproved,
      normalizeRoleNumber: normalizeRoleNumber,
      buildVerifyUrl: buildVerifyUrl,
      getPhotoUrl: getPhotoUrl,
      buildIdCardPayload: buildIdCardPayload
    };
  }
  installYYCCore();
})();
