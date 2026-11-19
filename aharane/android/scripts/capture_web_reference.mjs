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

  // Use the actual production web UI and only stub its API with empty,
  // disconnected responses. No sample chat or server metrics are injected.
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
  await delay(500);

  const out = "web-reference-screenshots";
  const fs = await import("node:fs/promises");
  await fs.mkdir(out, { recursive: true });
  const shot = async name => {
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false, animations: "disabled" });
  };

  await shot("01-home");
  const navButton = label => page.locator("#nav button").filter({ hasText: label }).first();
  for (const [label, name] of [
    ["Chats", "02-chats"],
    ["Files", "03-files"],
    ["ENV", "04-env"],
    ["More", "05-more"]
  ]) {
    await navButton(label).click();
    await delay(250);
    await shot(name);
  }

  await page.getByText("Appearance", { exact: true }).last().click();
  await delay(250);
  await shot("06-appearance");

  console.log("Captured actual web Studio Home, Chats, Files, ENV, More and Appearance at 412×915 with empty disconnected API responses.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
