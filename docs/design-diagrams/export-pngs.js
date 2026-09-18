const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function exportAllPngs() {
  const dir = 'c:/Users/asus/Desktop/code/Git/bizai/docs/design-diagrams';
  const pngOutputDir = path.join(dir, 'png');
  
  if (!fs.existsSync(pngOutputDir)) {
    fs.mkdirSync(pngOutputDir, { recursive: true });
  }

  console.log('Starting Canva-optimized PNG export...');

  // Launch puppeteer
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set viewport exactly to 1920x1080.
  // We use deviceScaleFactor: 2 for Retina quality (sharp text), Canva will treat it as a 1920x1080 image.
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  await page.goto('file:///' + path.join(dir, 'preview.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });

  // Wait for all mermaid svg elements to render
  await page.waitForSelector('.diagram-canvas svg');

  // Inject CSS and modify SVGs to scale perfectly
  const diagramIds = await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box !important;
      }
      body.export-mode {
        padding: 0 !important;
        margin: 0 !important;
        background: #ffffff !important;
        overflow: hidden !important;
        width: 1920px !important;
        height: 1080px !important;
      }
      body.export-mode .header, 
      body.export-mode .diagram-header, 
      body.export-mode .explanation-panel {
        display: none !important;
      }
      body.export-mode .diagram {
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
        display: none;
        height: 1080px;
        width: 1920px;
      }
      body.export-mode .diagram.active-export {
        display: flex !important;
      }
      body.export-mode .diagram-canvas {
        padding: 80px; /* Adds a nice 80px border around the diagram so it doesn't touch the edges */
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      /* Force the SVG to take up exactly the padded container, maintaining aspect ratio */
      body.export-mode .diagram-canvas svg {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
      }
    `;
    document.head.appendChild(style);
    document.body.classList.add('export-mode');

    const cards = Array.from(document.querySelectorAll('.diagram'));
    
    // Remove hardcoded pixel sizes from mermaid SVGs so they can scale up to fill the 1920x1080 screen
    cards.forEach(c => {
      const svg = c.querySelector('svg');
      if (svg) {
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.removeAttribute('style'); // Remove inline max-width properties that restrict size
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    });

    return cards.map(c => {
      const titleEl = c.querySelector('h2');
      return {
        id: c.id,
        title: titleEl ? titleEl.innerText.trim().replace('.mmd', '') : c.id
      };
    });
  });

  for (const d of diagramIds) {
    // Show only the current diagram centered in the 1920x1080 viewport
    await page.evaluate((id) => {
      document.querySelectorAll('.diagram').forEach(el => el.classList.remove('active-export'));
      document.getElementById(id).classList.add('active-export');
    }, d.id);

    // Give it a tiny bit of time to apply layout
    await new Promise(r => setTimeout(r, 200));

    const outPath = path.join(pngOutputDir, d.title + '.png');
    // Take screenshot of the entire 1920x1080 viewport
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`Exported for Canva: ${d.title}.png`);
  }

  await browser.close();
  console.log('\\nAll Canva-ready PNGs successfully saved to ' + pngOutputDir);
}

exportAllPngs().catch(err => {
  console.error('Puppeteer error:', err.message);
});
