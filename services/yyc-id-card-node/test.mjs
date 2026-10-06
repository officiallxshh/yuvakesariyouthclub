import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeIdCardRequest,
  resolveInsideRepo,
  buildPythonRenderArgs
} from "./index.mjs";

test("normalizes an approved member request", () => {
  const request = normalizeIdCardRequest({
    kind: "member",
    name: "YYC Test Member",
    position: "MEMBER",
    role_number: "YYC-001",
    phone: "9000000000",
    email: "test@example.invalid",
    verify_url: "https://www.yuvakesariyouthclub.in/verify.html?uid=YYC-001"
  });

  assert.equal(request.member.name, "YYC Test Member");
  assert.equal(request.member.role_number, "YYC-001");
  assert.equal(request.kind, "member");
});

test("rejects pending role numbers", () => {
  assert.throws(
    () => normalizeIdCardRequest({
      name: "YYC Member",
      role_number: "PENDING",
      verify_url: "https://www.yuvakesariyouthclub.in/verify.html?uid=PENDING"
    }),
    /valid role number/
  );
});

test("keeps file paths inside the repository", () => {
  assert.throws(
    () => resolveInsideRepo("../../outside.json", "Data"),
    /must stay inside/
  );
});

test("builds a bounded Python renderer command", () => {
  const result = buildPythonRenderArgs({
    kind: "leader",
    name: "YYC Leader",
    position: "PRESIDENT",
    role_number: "YYC-L-001",
    verify_url: "https://www.yuvakesariyouthclub.in/verify.html?uid=YYC-L-001",
    template: "assets/yyc-id-card-master.png",
    data: "services/id-card-renderer-python/test-data.json",
    output: "services/id-card-renderer-python/out/YYC-L-001.png"
  });

  assert.equal(result.request.kind, "leader");
  assert.ok(result.pythonArgs.includes("--verify-url"));
  const verifyIndex = result.pythonArgs.indexOf("--verify-url");
  assert.equal(result.pythonArgs[verifyIndex + 1], "https://www.yuvakesariyouthclub.in/verify.html?uid=YYC-L-001");
});
