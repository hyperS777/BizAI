const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mmd'));

// Parse PRESENTATION-EXPLANATION-GUIDE.md
const guideText = fs.readFileSync(path.join(dir, 'PRESENTATION-EXPLANATION-GUIDE.md'), 'utf8');

// Simple parser to extract explanation sections
const sections = guideText.split(/\n## DIAGRAM /i);
const explanationsMap = {};

for (let i = 1; i < sections.length; i++) {
  const sec = sections[i];
  const numMatch = sec.match(/^(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    // Remove the title line
    const content = sec.substring(sec.indexOf('\n') + 1).trim();
    explanationsMap[num] = content;
  }
}

// Map filenames to numbers
function getFileNumber(filename) {
  const m = filename.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Convert markdown to clean HTML
function markdownToHtml(md) {
  if (!md) return '<p>No explanation guide available for this diagram.</p>';

  let html = md
    // Escape basic html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    // Bold & Italic
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    // Quotes / Say out loud
    .replace(/^&gt; (.*$)/gim, '<blockquote>$1</blockquote>');

  // Parse markdown tables
  html = html.replace(/((?:\|[^\n]+\|\r?\n)+)/g, function (tableBlock) {
    const rows = tableBlock.trim().split(/\r?\n/).filter(r => r.trim());
    if (rows.length < 2) return tableBlock;

    let tableHtml = '<div class="table-container"><table>';
    let isHeader = true;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r].trim();
      if (row.includes('---')) {
        isHeader = false;
        continue;
      }
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      tableHtml += '<tr>';
      for (const cell of cells) {
        if (isHeader) {
          tableHtml += `<th>${cell}</th>`;
        } else {
          tableHtml += `<td>${cell}</td>`;
        }
      }
      tableHtml += '</tr>';
      if (r === 0) isHeader = false;
    }
    tableHtml += '</table></div>';
    return tableHtml;
  });

  // Paragraphs
  html = html.split(/\n\n+/).map(p => {
    if (p.startsWith('<h') || p.startsWith('<div') || p.startsWith('<blockquote')) return p;
    return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  return html;
}

let html = `<!DOCTYPE html>
<html>

<head>
  <meta charset="utf-8" />
  <title>BizAI Architecture & Design Diagrams</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'base',
      themeVariables: {
        darkMode: false,
        background: '#ffffff',
        primaryColor: '#dbeafe',
        primaryTextColor: '#1e293b',
        primaryBorderColor: '#3b82f6',
        lineColor: '#475569',
        secondaryColor: '#fce7f3',
        tertiaryColor: '#f0fdf4',
        noteBkgColor: '#fefce8',
        noteTextColor: '#1e293b',
        noteBorderColor: '#facc15',
        actorTextColor: '#1e293b',
        actorBorder: '#3b82f6',
        actorBkg: '#dbeafe',
        signalColor: '#475569',
        signalTextColor: '#1e293b',
        labelBoxBkgColor: '#dbeafe',
        labelBoxBorderColor: '#3b82f6',
        labelTextColor: '#1e293b',
        loopTextColor: '#1e293b',
        activationBorderColor: '#3b82f6',
        activationBkgColor: '#eff6ff',
        sequenceNumberColor: '#ffffff',
        sectionBkgColor: '#dbeafe',
        altSectionBkgColor: '#f0f9ff',
        sectionBkgColor2: '#fce7f3',
        taskBorderColor: '#3b82f6',
        taskBkgColor: '#dbeafe',
        taskTextColor: '#1e293b',
        activeTaskBorderColor: '#2563eb',
        activeTaskBkgColor: '#bfdbfe',
        gridColor: '#cbd5e1',
        doneTaskBkgColor: '#bbf7d0',
        doneTaskBorderColor: '#22c55e',
        critBorderColor: '#ef4444',
        critBkgColor: '#fecaca',
        entityBorder: '#3b82f6',
        entityBkg: '#dbeafe',
        relationColor: '#475569',
        classText: '#1e293b'
      },
      flowchart: {
        curve: 'monotoneY'
      }
    });

    window.toggleExplanation = function (id) {
      const panel = document.getElementById('expl_' + id);
      const btn = document.getElementById('btn_' + id);
      if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
        btn.classList.add('active');
        btn.innerHTML = '📖 Hide Explanation';
      } else {
        panel.style.display = 'none';
        btn.classList.remove('active');
        btn.innerHTML = '📖 View Explanation';
      }
    };

    window.downloadSVG = function (containerId, filename) {
      const container = document.getElementById(containerId);
      const svg = container.querySelector('svg');
      if (!svg) {
        alert('Diagram still loading, please wait a moment.');
        return;
      }

      // Clone the SVG so we don't change the live page
      const clone = svg.cloneNode(true);
      // Force 1920x1080 resolution for PowerPoint
      clone.setAttribute('width', '1920');
      clone.setAttribute('height', '1080');
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      const svgData = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.mmd', '.svg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    window.downloadPNG = function (containerId, filename) {
      const container = document.getElementById(containerId);
      const svg = container.querySelector('svg');
      if (!svg) {
        alert('Diagram still loading, please wait a moment.');
        return;
      }

      const scale = 2; // 2x scale for High Quality (3840x2160)
      const baseWidth = 1920;
      const baseHeight = 1080;
      const basePadding = 80;

      const clone = svg.cloneNode(true);
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      // Ensure no max-width restricts the high-res rendering
      clone.setAttribute('style', 'max-width: none !important; max-height: none !important; background: transparent;');
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      // Inject CSS so the PNG preserves the custom styling (like transparent subgraphs)
      const styleElement = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleElement.textContent = \`
        .edgePath path { stroke-width: 2px !important; stroke: #475569 !important; }
        .edgeLabel { background-color: #ffffff !important; padding: 2px 6px !important; border-radius: 4px !important; border: 1px solid #e2e8f0 !important; color: #1e293b !important; }
        .cluster rect { fill: #f8fafc !important; stroke: #93c5fd !important; stroke-width: 2px !important; stroke-opacity: 1 !important; }
        .label { color: #1e293b !important; }
        text { fill: #1e293b !important; }
        .node rect, .node polygon, .node circle { stroke: #3b82f6 !important; }
      \`;
      clone.prepend(styleElement);

      // Scale up the SVG drawing size for crisp rendering
      const imgW = (baseWidth - basePadding * 2) * scale;
      const imgH = (baseHeight - basePadding * 2) * scale;
      clone.setAttribute('width', imgW.toString());
      clone.setAttribute('height', imgH.toString());

      const svgData = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const DOMURL = window.URL || window.webkitURL || window;
      const url = DOMURL.createObjectURL(svgBlob);

      const canvas = document.createElement('canvas');
      canvas.width = baseWidth * scale;
      canvas.height = baseHeight * scale;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const img = new Image();
      img.onload = function () {
        ctx.drawImage(img, basePadding * scale, basePadding * scale, imgW, imgH);
        DOMURL.revokeObjectURL(url);

        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = filename.replace('.mmd', '.png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      img.src = url;
    };

    window.downloadAllSVGs = async function () {
      const buttons = document.querySelectorAll('.download-btn');
      for (const btn of buttons) {
        btn.click();
        await new Promise(r => setTimeout(r, 200));
      }
    };

    window.downloadAllPNGs = async function () {
      const buttons = document.querySelectorAll('button[onclick^="downloadPNG"]');
      for (const btn of buttons) {
        btn.click();
        await new Promise(r => setTimeout(r, 400));
      }
    };
  </script>
  <style>
    :root {
      --bg-primary: #f1f5f9;
      --bg-card: #ffffff;
      --border: #e2e8f0;
      --accent: #2563eb;
      --text: #0f172a;
      --text-muted: #64748b;
    }

    body {
      background: var(--bg-primary);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
      margin: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 16px;
    }

    .header h1 {
      margin: 0 0 6px 0;
      font-size: 1.6rem;
    }

    .header p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .btn {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .btn-secondary.active {
      background: #2563eb;
      color: #fff;
      border-color: #2563eb;
    }

    .diagram {
      background: var(--bg-card);
      padding: 24px;
      margin-bottom: 32px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .diagram-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 12px;
    }

    .diagram-header h2 {
      margin: 0;
      color: var(--accent);
      font-size: 1.2rem;
    }

    .action-group {
      display: flex;
      gap: 10px;
    }

    .diagram-canvas {
      overflow-x: auto;
      text-align: center;
      padding: 20px 0;
    }

    .diagram-canvas svg {
      max-width: 100%;
      height: auto;
    }

    /* Bridge over / clear path styling for mermaid lines */
    .edgePath path {
      stroke-width: 2px !important;
    }

    .edgeLabel {
      background-color: #ffffff !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      border: 1px solid #e2e8f0 !important;
      color: #1e293b !important;
    }

    .cluster rect,
    svg g.cluster rect {
      fill: #f8fafc !important;
      stroke: #93c5fd !important;
      stroke-width: 2px !important;
    }

    /* Explanation Panel */
    .explanation-panel {
      display: none;
      margin-top: 20px;
      padding: 20px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      border-left: 4px solid var(--accent);
      color: #334155;
      line-height: 1.6;
      font-size: 0.92rem;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .explanation-panel h4 {
      color: #2563eb;
      margin: 16px 0 8px 0;
      font-size: 1.05rem;
    }

    .explanation-panel h4:first-child {
      margin-top: 0;
    }

    .explanation-panel p {
      margin: 8px 0;
    }

    .explanation-panel code {
      background: #e2e8f0;
      color: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85em;
    }

    .explanation-panel blockquote {
      margin: 12px 0;
      padding: 10px 16px;
      background: #eff6ff;
      border-left: 3px solid #2563eb;
      color: #1e293b;
      border-radius: 0 6px 6px 0;
    }

    .table-container {
      overflow-x: auto;
      margin: 14px 0;
    }

    .explanation-panel table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .explanation-panel th,
    .explanation-panel td {
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }

    .explanation-panel th {
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 600;
    }

    .explanation-panel tr:nth-child(even) td {
      background: #f8fafc;
    }
  </style>
</head>

<body>
  <div class="header">
    <div>
      <h1>BizAI Design & Architecture Diagrams</h1>
      <p>Interactive presentation guide with lossless SVG exports and speaking notes for presentation.</p>
    </div>
    <div style="display: flex; gap: 10px;">
      <button class="btn" onclick="downloadAllSVGs()">⬇️ Download All SVGs</button>
      <button class="btn" onclick="downloadAllPNGs()">🖼️ Download All PNGs</button>
    </div>
  </div>
`;

for (const f of files) {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const safeId = f.replace(/[^a-zA-Z0-9_-]/g, '_');
  const num = getFileNumber(f);
  const explanation = num ? markdownToHtml(explanationsMap[num]) : '<p>Detailed explanation available in presentation guide.</p>';

  html += `
  <div class="diagram" id="card_${safeId}">
    <div class="diagram-header">
      <h2>${f}</h2>
      <div class="action-group">
        <button class="btn btn-secondary" id="btn_${safeId}" onclick="toggleExplanation('${safeId}')">📖 View Explanation</button>
        <button class="btn btn-secondary download-btn" onclick="downloadSVG('content_${safeId}', '${f}')">⬇️ Download SVG</button>
        <button class="btn btn-secondary" onclick="downloadPNG('content_${safeId}', '${f}')">🖼️ Download PNG</button>
      </div>
    </div>
    <div class="diagram-canvas" id="content_${safeId}">
      <pre class="mermaid">
${content}
      </pre>
    </div>
    <div class="explanation-panel" id="expl_${safeId}">
      ${explanation}
    </div>
  </div>\n`;
}

html += `</body>\n</html>`;
fs.writeFileSync(path.join(dir, 'preview.html'), html);
console.log('preview.html successfully generated with original light presentation style, lossless SVG & PNG exports');
