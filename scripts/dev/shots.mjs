import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = "http://localhost:3100";
const out = process.argv[2];
const paths = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const browser = await chromium.launch();
for (const [name, width, height, scheme] of [["desk", 1280, 900, "light"], ["phone", 390, 844, "light"], ["dark", 1280, 900, "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, storageState: "e2e/.auth/user.json" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
  for (const p of paths) {
    const res = await page.goto(base + p, { waitUntil: "networkidle" });
    const file = `${out}/${name}${p.replace(/[\/?=&]+/g, "_") || "_home"}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(name, res?.status(), p, "->", file.split("/").pop());
  }
  if (errors.length) console.log(name, "CONSOLE", errors.slice(0, 10));
  await ctx.close();
}
await browser.close();
