const { chromium } = require("playwright");

const TARGET_URL = process.env.F10_PRIVACY_URL || "http://127.0.0.1:4178/privacy";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 25 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  try {
    const response = await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!response || response.status() !== 200) {
      throw new Error(`Expected HTTP 200, received ${response?.status() ?? "no response"}`);
    }

    await page.waitForSelector("article.terms-document");
    const bodyText = await page.locator("body").innerText();
    if (!bodyText.includes("Versi 1.1")) throw new Error("Version 1.1 is not rendered");
    if (!bodyText.includes("14 Agustus 2026")) throw new Error("Updated date is not rendered");
    if (!bodyText.includes("penerima yang Anda tunjuk")) throw new Error("Recipient summary is not rendered");
    if (bodyText.includes("tiket yang diterbitkan tidak menyimpan ulang data kontak")) {
      throw new Error("Obsolete privacy sentence is still rendered");
    }
    if (/sumopod/i.test(bodyText)) throw new Error("Retired Sumopod copy is still rendered");

    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    const canonical = await page.locator('link[rel="canonical"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    if (!title.includes("Kebijakan Privasi")) throw new Error(`Unexpected title: ${title}`);
    if (!description?.includes("pembelian tiket tanpa akun")) throw new Error("Description is incomplete");
    if (
      canonical.length === 0 ||
      canonical.some((href) => !href?.endsWith("/privacy"))
    ) {
      throw new Error(`Unexpected canonical URLs: ${JSON.stringify(canonical)}`);
    }

    const sectionAnchors = await page.locator("article > section[id]").evaluateAll((sections) =>
      sections.map((section) => section.id),
    );
    const tocHrefs = await page.locator("aside .terms-toc a").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    if (sectionAnchors.length !== 30 || tocHrefs.length !== 30) {
      throw new Error(`Expected 30 sections/TOC links, got ${sectionAnchors.length}/${tocHrefs.length}`);
    }
    if (tocHrefs.some((href, index) => href !== `#${sectionAnchors[index]}`)) {
      throw new Error("Desktop TOC anchors do not match rendered sections");
    }

    await page.screenshot({ path: "C:/Users/danth/AppData/Local/Temp/f10-privacy-desktop.png", fullPage: true });

    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const tocButton = page.getByRole("button", { name: "Daftar Isi" });
    console.log(
      "mobile-button-debug",
      await tocButton.count(),
      await tocButton.isVisible(),
      await tocButton.getAttribute("aria-expanded"),
      await page.locator("#mobile-daftar-isi").count(),
      errors,
    );
    if (!(await tocButton.isVisible())) throw new Error("Mobile TOC trigger is not visible");
    await tocButton.click();
    console.log(
      "mobile-after-click-debug",
      await tocButton.getAttribute("aria-expanded"),
      await page.locator("#mobile-daftar-isi").count(),
      errors,
    );
    const dialog = page.getByRole("dialog", { name: "Daftar Isi" });
    await page.waitForTimeout(500);
    console.log(
      "mobile-dialog-debug",
      await page.locator("#mobile-daftar-isi").evaluateAll((elements) =>
        elements.map((element) => ({
          outerHTML: element.outerHTML.slice(0, 500),
          display: getComputedStyle(element).display,
          visibility: getComputedStyle(element).visibility,
          opacity: getComputedStyle(element).opacity,
          rect: element.getBoundingClientRect().toJSON(),
        })),
      ),
    );
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const firstLink = dialog.getByRole("link").first();
    if ((await firstLink.getAttribute("href")) !== `#${sectionAnchors[0]}`) {
      throw new Error("Mobile TOC first anchor does not match the first section");
    }
    await firstLink.click();
    await page.locator("#mobile-daftar-isi").waitFor({ state: "detached", timeout: 5_000 });
    await page.screenshot({ path: "C:/Users/danth/AppData/Local/Temp/f10-privacy-mobile.png", fullPage: true });

    const unexpectedErrors = errors.filter(
      (message) =>
        !message.includes("nonce={undefined}") && !message.includes('nonce=""'),
    );
    if (unexpectedErrors.length) throw new Error(unexpectedErrors.join("\n"));
    console.log(JSON.stringify({
      status: "passed",
      url: TARGET_URL,
      title,
      canonical,
      sections: sectionAnchors.length,
      desktopTocLinks: tocHrefs.length,
      mobileToc: "passed",
      knownDevWarnings: errors.length - unexpectedErrors.length,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
