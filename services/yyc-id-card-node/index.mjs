import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SERVICE_DIR, "..", "..");

function clean(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function normalizeIdCardRequest(input = {}) {
  const kind = clean(input.kind, "member").toLowerCase();
  if (kind !== "member" && kind !== "leader") {
    throw new Error("ID-card kind must be member or leader.");
  }

  const member = {
    name: clean(input.name, "YYC Member"),
    position: clean(input.position, "MEMBER"),
    role_number: clean(input.role_number, "PENDING"),
    phone: clean(input.phone),
    email: clean(input.email)
  };

  if (member.role_number === "PENDING") {
    throw new Error("A valid role number is required before rendering an approved ID card.");
  }
  if (!clean(input.verify_url)) {
    throw new Error("A verification URL is required for the QR code.");
  }

  return { member, kind, verify_url: clean(input.verify_url) };
}

export function resolveInsideRepo(relativeOrAbsolutePath, label) {
  const raw = clean(relativeOrAbsolutePath);
  if (!raw) throw new Error(label + " path is required.");

  const resolved = path.resolve(REPO_ROOT, raw);
  const relative = path.relative(REPO_ROOT, resolved);

  if (!relative || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error(label + " path must stay inside the YYC repository.");
  }
  return resolved;
}

export function buildPythonRenderArgs(options) {
  const request = normalizeIdCardRequest(options);
  const template = resolveInsideRepo(options.template, "Template");
  const output = resolveInsideRepo(options.output, "Output");
  const photo = options.photo ? resolveInsideRepo(options.photo, "Photo") : null;
  const dataPath = resolveInsideRepo(options.data, "Data");

  return {
    request,
    pythonArgs: [
      path.join("services", "id-card-renderer-python", "renderer.py"),
      "--template", template,
      ...(photo ? ["--photo", photo] : []),
      "--data", dataPath,
      "--verify-url", request.verify_url,
      "--output", output,
      ...(options.font ? ["--font", resolveInsideRepo(options.font, "Font")] : [])
    ]
  };
}

export function runPythonRenderer(options) {
  const { request, pythonArgs } = buildPythonRenderArgs(options);
  if (!fs.existsSync(pythonArgs[0])) {
    throw new Error("Python renderer file is missing.");
  }

  const pythonBin = clean(process.env.YYC_PYTHON_BIN, "python");
  const result = spawnSync(pythonBin, pythonArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(clean(result.stderr, clean(result.stdout, "Python renderer failed.")));
  }

  return {
    kind: request.kind,
    roleNumber: request.member.role_number,
    output: resolveInsideRepo(options.output, "Output"),
    stdout: clean(result.stdout)
  };
}

function readArg(args, flag, required = true) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : "";
  if (required && !clean(value)) throw new Error(flag + " is required.");
  return value;
}

function main() {
  const args = process.argv.slice(2);
  const dataPath = readArg(args, "--data");
  const dataFile = resolveInsideRepo(dataPath, "Data");
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("ID-card data JSON must contain an object.");
  }

  const request = normalizeIdCardRequest(data);
  const result = runPythonRenderer({
    ...data,
    ...request.member,
    kind: request.kind,
    verify_url: request.verify_url,
    data: dataPath,
    template: readArg(args, "--template"),
    photo: readArg(args, "--photo", false),
    output: readArg(args, "--output"),
    font: readArg(args, "--font", false)
  });

  process.stdout.write(JSON.stringify(result) + "\n");
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === currentFile) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
