const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function exportAllSvgs() {
  const dir = 'c:/Users/asus/Desktop/code/Git/bizai/docs/design-diagrams';
  const svgOutputDir = path.join(dir, 'svg');
  if (!fs.existsSync(svgOutputDir)) {
    fs.mkdirSync(svgOutputDir, { recursive: true });
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(dir, 'preview.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });

  // Wait for all mermaid svg elements to render
  await page.waitForSelector('.diagram-canvas svg');

  // Extract all svgs
  const diagrams = await page.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('.diagram');
    cards.forEach(card => {
      const title = card.querySelector('h2').innerText.trim();
      const svgEl = card.querySelector('svg');
      if (svgEl) {
        // Clone to avoid breaking the page
        const clone = svgEl.cloneNode(true);
        clone.setAttribute('width', '1920');
        clone.setAttribute('height', '1080');
        clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        results.push({
          filename: title.replace('.mmd', '.svg'),
          svg: clone.outerHTML
        });
      }
    });
    return results;
  });

  for (const d of diagrams) {
    const outPath = path.join(svgOutputDir, d.filename);
    fs.writeFileSync(outPath, d.svg, 'utf8');
    console.log(`Exported: ${d.filename}`);
  }

  await browser.close();
  console.log('All SVGs successfully saved to ' + svgOutputDir);
}

exportAllSvgs().catch(err => {
  console.error('Puppeteer not installed or error:', err.message);
});
