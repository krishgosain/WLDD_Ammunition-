import qrcode from 'qrcode-generator';

/**
 * The URL as a QR code, returned as a single SVG path.
 *
 * A printed page keeps no hyperlink, and print-to-PDF engines only sometimes
 * carry the anchor through as a link annotation, so the report URL is also
 * drawn as a code the client can scan off paper or off the PDF.
 *
 * Runs of dark modules in a row collapse into one horizontal rect-as-path,
 * which keeps the markup small enough to inline for every panel on the page.
 */
export function qrPath(url: string, cell = 4): { d: string; size: number } | null {
  if (!url) return null;
  try {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    const n = q.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < n; row++) {
      let run = 0;
      for (let col = 0; col <= n; col++) {
        const dark = col < n && q.isDark(row, col);
        if (dark) { run++; continue; }
        if (run) {
          parts.push(`M${(col - run) * cell} ${row * cell}h${run * cell}v${cell}h-${run * cell}z`);
          run = 0;
        }
      }
    }
    return { d: parts.join(''), size: n * cell };
  } catch {
    return null;
  }
}
