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

  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(String(error?.stack || error)));
  page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("http://127.0.0.1:4173/aharane/studio/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("aharane-authenticated"), null, { timeout: 15000 });
  try {
    await page.waitForSelector("[data-open-web-builder]", { timeout: 15000 });
  } catch (error) {
    const diagnostics = {
      browserErrors,
      bodyText: await page.locator("body").innerText().catch(() => "unavailable"),
      viewHtml: await page.locator("#view").innerHTML().catch(() => "missing #view"),
      navHtml: await page.locator("#nav").innerHTML().catch(() => "missing #nav")
    };
    console.error("Studio Home did not expose the Builder entry point:", JSON.stringify(diagnostics));
    throw error;
  }
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const navFit = await page.locator("#nav").evaluate(el => ({
    buttons: el.querySelectorAll("button").length,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    labels: [...el.querySelectorAll("button")].map(button => button.innerText.trim())
  }));
  const expectedTabs = ["Home", "Files", "Chats", "ENV", "More"];
  if (JSON.stringify(navFit.labels) !== JSON.stringify(expectedTabs) ||
      navFit.buttons !== 5 || navFit.scrollWidth > navFit.clientWidth + 1) {
    throw new Error("The native five-tab navigation changed or overflows: " + JSON.stringify(navFit));
  }
  if (navFit.labels[2] !== "Chats") throw new Error("Chats must remain the third navigation item.");
  await delay(500);

  const out = "web-reference-screenshots";
  const fs = await import("node:fs/promises");
  await fs.mkdir(out, { recursive: true });
  const shot = async name => page.screenshot({
    path: out + "/" + name + ".png", fullPage: false, animations: "disabled"
  });
  const navButton = label => page.locator("#nav button").filter({ hasText: label }).first();
  const activateNav = async label => {
    await navButton(label).evaluate(button => button.click());
    await delay(280);
  };

  await shot("01-home");
  await page.locator("[data-open-web-builder]").click();
  await page.waitForSelector("[data-wb-add='trigger.command']", { timeout: 15000 });
  await shot("02-home-command-builder-entry");
  await page.locator("[data-wb-add='trigger.command']").click();
  await page.locator("[data-wb-add='message.sendText']").click();
  await page.locator(".wb-node-card").first().click();
  await shot("03-command-node-configuration");
  await page.locator("[data-wb-cancel-config]").last().click();
  const outputSocket = page.locator(".wb-node-card").first().locator("[data-wb-socket][data-direction='out']").first();
  const inputSocket = page.locator(".wb-node-card").nth(1).locator("[data-wb-socket][data-direction='in']").first();
  await outputSocket.click();
  await inputSocket.click();
  await page.waitForFunction(() => document.querySelectorAll("#wb-wires path").length === 1, null, { timeout: 5000 });
  if (await page.locator("#wb-wires path").count() !== 1) throw new Error("Builder did not draw the expected typed connection.");
  const splitter = page.locator("[data-wb-resize]");
  const splitterBox = await splitter.boundingBox();
  if (!splitterBox) throw new Error("The Builder canvas/library resize handle is not visible.");
  const beforeCanvasHeight = await page.locator(".wb-canvas-section").evaluate(el => el.getBoundingClientRect().height);
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + splitterBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + splitterBox.height / 2 + 42, { steps: 6 });
  await page.mouse.up();
  const afterCanvasHeight = await page.locator(".wb-canvas-section").evaluate(el => el.getBoundingClientRect().height);
  if (Math.abs(afterCanvasHeight - beforeCanvasHeight) < 20) {
    throw new Error("Dragging the Builder divider did not resize the canvas.");
  }
  await page.locator("[data-wb-fit]").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("04-command-canvas-connected-nodes");
  await page.locator(".wb-top-actions [data-wb-manage-engines]").click();
  await page.waitForSelector("[data-engine-open='text_transform']", { timeout: 15000 });
  await shot("05-engine-library-from-builder");
  await page.locator("[data-engine-open='text_transform']").click();
  await page.waitForSelector("[data-engine-run]");
  await shot("06-engine-details");
  await page.locator("[data-engine-run]").click();
  await delay(150);
  await shot("07-engine-safe-test");
  await page.locator("[data-engine-back]").click();
  await delay(150);
  await page.locator("[data-wb-back]").click();
  await delay(150);
  await activateNav("Files");
  await page.locator("[data-open-engine-library]").click();
  await page.waitForSelector("[data-engine-open='text_transform']");
  await shot("08-files-virtual-engines-folder");
  await page.locator("[data-engine-open='text_transform']").click();
  await page.locator("[data-engine-edit]").click();
  await shot("09-engine-editor");
  await page.locator("[data-engine-back]").click();

  await activateNav("Home");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("[data-open-web-builder]").click();
  await page.waitForSelector("[data-wb-add='trigger.command']");
  await page.locator("[data-wb-add='trigger.command']").click();
  await page.locator("[data-wb-add='message.sendText']").click();
  await page.waitForSelector(".wb-node-card");
  await page.locator("[data-wb-fit]").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("10-desktop-command-canvas");
  await page.locator(".wb-node-card").first().click();
  await shot("11-desktop-node-configuration");
  await page.locator("[data-wb-cancel-config]").last().click();
  await page.locator(".wb-top-actions [data-wb-manage-engines]").click();
  await page.locator("[data-engine-open='text_transform']").click();
  await shot("12-desktop-engine-details");
  await page.locator("[data-engine-edit]").click();
  await shot("13-desktop-engine-editor");
  console.log("Captured mobile and desktop Studio, Builder canvas, node configuration and Engine screens.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
