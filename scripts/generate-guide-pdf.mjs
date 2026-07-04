#!/usr/bin/env node
/**
 * Generates docs/Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.pdf from the HTML guide.
 * Usage: node scripts/generate-guide-pdf.mjs
 * Requires: npx puppeteer (auto-installed on first run via dynamic import)
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const htmlFile = path.join(root, 'docs', 'Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.html');
const pdfFile = path.join(root, 'docs', 'Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.pdf');

if (!existsSync(htmlFile)) {
  console.error('Missing:', htmlFile);
  process.exit(1);
}

let puppeteer;
try {
  const require = createRequire(import.meta.url);
  puppeteer = require('puppeteer');
} catch {
  console.error('Install puppeteer: npm install -D puppeteer');
  console.error('Or open the HTML in Chrome → Print → Save as PDF (enable Background graphics).');
  process.exit(1);
}

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.emulateMediaType('print');
await page.goto(`file://${htmlFile.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(() => {
  document.documentElement.style.backgroundColor = '#020617';
  document.body.style.backgroundColor = '#020617';
});
await page.pdf({
  path: pdfFile,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await browser.close();
console.log('PDF written:', pdfFile);
