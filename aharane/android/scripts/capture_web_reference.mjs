import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";

const server = spawn("python3", ["-m", "http.server", "4173", "--directory", "web"], {
  stdio: "ignore",
  detached: true
});

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4173/aharane/studio/");
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(200);
  }
  if (!ready) throw new Error("The local web reference server did not start.");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  // Use the actual production web UI with deterministic test fixtures. The browser
  // screens are still the real app; API fixtures are isolated to this screenshot run.
  let savedWorkflow = null;
  const sampleLibrary = [
    { category: "Triggers and events", nodes: [
      { type: "trigger.command", name: "Command trigger", description: "Start on an allowed WhatsApp command.", ports: { inputs: [], outputs: [{ id: "next", label: "Next", type: "exec" }, { id: "messageText", label: "Message text", type: "string" }] } },
      { type: "trigger.message", name: "Message received", description: "Start on an allowed Public message event.", ports: { inputs: [], outputs: [{ id: "next", label: "Next", type: "exec" }, { id: "messageText", label: "Message text", type: "string" }] } }
    ]},
    { category: "Messages", nodes: [
      { type: "message.sendText", name: "Send text", description: "Send text to the triggering chat.", ports: { inputs: [{ id: "in", label: "In", type: "exec" }, { id: "text", label: "Text", type: "string" }], outputs: [{ id: "next", label: "Next", type: "exec" }] } }
    ]},
    { category: "Data conversion", nodes: [
      { type: "value.toNumber", name: "Convert to number", description: "Convert validated text into a number.", ports: { inputs: [{ id: "value", label: "Value", type: "string" }], outputs: [{ id: "number", label: "Number", type: "number" }] } },
      { type: "value.toBoolean", name: "Convert to boolean", description: "Convert text into a boolean value.", ports: { inputs: [{ id: "value", label: "Value", type: "string" }], outputs: [{ id: "boolean", label: "Boolean", type: "boolean" }] } }
    ]}
  ];
  const sampleEngine = {
    manifest: { id: "text_transform", name: "Text transform", version: 1, entryPoint: "run",
      inputs: [{ id: "value", type: "string" }], outputs: [{ id: "result", type: "string" }],
      permissions: [], allowedHosts: [], timeoutMs: 10000, maxResults: 10 },
    code: "export async function run(inputs, context) { return { result: String(inputs.value ?? '') } }",
    revision: 1, sha256: "test-fixture"
  };
  await page.route("**/aharane/api/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/aharane/api/", "");
    let body;
    if (path === "auth/status") body = { ok: true, setupRequired: false };
    else if (path === "status") body = {
      ok: true,
      accounts: {
        private: { connected: false, registered: false },
        public: { connected: false, registered: false }
      }
    };
    else if (path === "studio/snapshot") body = { ok: true, uptimeSeconds: 0 };
    else if (path === "owners") body = { ok: true, owners: {} };
    else if (path === "env") body = { ok: true, env: [] };
    else if (path === "metrics") body = { ok: true, hourlyMessages: [] };
    else if (path.startsWith("activity")) body = { ok: true, entries: [] };
    else if (path === "update/status") body = {
      ok: true,
      manualEdits: { pending: false, stale: false },
      changedCount: 0
    };
    else if (path === "files/packages") body = { ok: true, packages: [] };
    else if (path.startsWith("files/tree")) body = { ok: true, children: [] };
    else if (path === "visual-commands" && route.request().method() === "GET") body = {
      ok: true, workflows: savedWorkflow ? [savedWorkflow] : [], library: sampleLibrary, customNodes: []
    };
    else if (path === "visual-commands" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      savedWorkflow = { ...payload.workflow, revision: 1 };
      body = { ok: true, workflow: savedWorkflow, validation: { valid: true, errors: [], warnings: [], summary: { nodes: savedWorkflow.nodes.length, connections: savedWorkflow.edges.length, errors: 0, warnings: 0 } } };
    }
    else if (path.startsWith("visual-commands/") && path.endsWith("/test")) body = { ok: true, dryRun: true, result: { ok: true, events: ["trigger evaluated", "dry-run send suppressed"] } };
    else if (path.startsWith("visual-commands/") && route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      savedWorkflow = { ...payload.workflow, revision: (savedWorkflow?.revision || 1) + 1 };
      body = { ok: true, workflow: savedWorkflow, validation: { valid: true, errors: [], warnings: [], summary: { nodes: savedWorkflow.nodes.length, connections: savedWorkflow.edges.length, errors: 0, warnings: 0 } } };
    }
    else if (path === "engines") body = { ok: true, engines: [{ ...sampleEngine.manifest, revision: 1 }], executionAvailable: true };
    else if (path === "engines/text_transform") body = { ok: true, engine: sampleEngine, executionAvailable: true };
    else if (path === "engines/text_transform/capabilities") body = { ok: true, revision: 1, capabilities: { contractVersion: 1, permissions: [], neverGranted: ["filesystem", "process", "shell", "whatsapp"], limits: { timeoutMs: 10000 } }, diagnostics: { findings: [] } };
    else if (path === "engines/text_transform/run") body = { ok: true, outcome: "success", outputs: { result: "sample" }, durationMs: 2, networkCalls: 0 };
    else body = { ok: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body)
    });
  });

  await page.goto("http://127.0.0.1:4173/aharane/studio/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("aharane-authenticated"), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#view")?.textContent?.includes("Welcome back"), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const navFit = await page.locator("#nav").evaluate(el => ({
    buttons: el.querySelectorAll("button").length,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    labels: [...el.querySelectorAll("button")].map(button => button.innerText.trim())
  }));
  if (navFit.buttons !== 7 || navFit.scrollWidth > navFit.clientWidth + 1) {
    throw new Error("The seven-item mobile navigation does not fit: " + JSON.stringify(navFit));
  }
  if (navFit.labels[2] !== "Chats") throw new Error("Chats must remain the third navigation item.");
  await delay(500);

  const out = "web-reference-screenshots";
  const fs = await import("node:fs/promises");
  await fs.mkdir(out, { recursive: true });
  const shot = async name => {
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false, animations: "disabled" });
  };

  await shot("01-home");
  const navButton = label => page.locator("#nav button").filter({ hasText: label }).first();
  const activateNav = async label => {
    // The fixed mobile tab rail is horizontally scrollable. Invoke the real
    // tab button handler directly so the screenshot test does not depend on
    // Playwright scrolling a clipped fixed-position child into view.
    await navButton(label).evaluate(button => button.click());
    await delay(300);
  };
  for (const [label, name] of [
    ["Chats", "02-chats"],
    ["Files", "03-files"],
    ["ENV", "04-env"],
    ["More", "05-more"]
  ]) {
    await activateNav(label);
    await shot(name);
  }

  await page.getByText("Appearance", { exact: true }).last().click();
  await delay(250);
  await shot("06-appearance");
  await page.keyboard.press("Escape");
  await delay(180);
  await activateNav("Builder");
  await page.locator("[data-wf-add='trigger.command']").click();
  await page.locator("[data-wf-add='message.sendText']").click();
  await page.locator("[data-wf-select]").nth(1).click();
  await shot("07-builder");
  await page.locator(".wb-inspector").evaluate(element => element.scrollIntoView({ block: "center" }));
  await delay(150);
  await shot("08-builder-node-configuration");

  await activateNav("Engine Library");
  await page.locator("[data-engine-open='text_transform']").click();
  await delay(200);
  await shot("09-engine-library");
  await page.locator("[data-engine-run]").click();
  await delay(200);
  await shot("10-engine-test-result");
  await page.locator("[data-engine-new]").click();
  await delay(150);
  await shot("11-engine-editor");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await activateNav("Builder");
  await shot("12-desktop-builder");
  await page.locator(".wb-inspector").evaluate(element => element.scrollIntoView({ block: "center" }));
  await delay(100);
  await shot("13-desktop-node-configuration");
  await activateNav("Engine Library");
  await page.locator("[data-engine-open='text_transform']").click();
  await delay(200);
  await shot("14-desktop-engine-library");
  await page.locator("[data-engine-edit]").click();
  await delay(150);
  await shot("15-desktop-engine-editor");
  console.log("Captured Studio screens at mobile and desktop sizes, including Builder and Engine Library.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
