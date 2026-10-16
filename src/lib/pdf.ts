import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

/** A4 portrait, in millimetres, with the same 10mm margin the print sheet used. */
const PAGE = { w: 210, h: 297, margin: 10 };

/**
 * Write an element to a PDF that keeps its links.
 *
 * The browser's print dialog cannot be trusted with this. Chrome's own
 * "Save as PDF" keeps an anchor as a /Link annotation, but "Microsoft Print
 * to PDF" — the default destination on a lot of Windows machines — is a
 * printer driver: it rasterises the page through the Windows print path and
 * every annotation is dropped. A one-pager printed that way has the report
 * pill drawn on it and nothing behind it to click, which is exactly what
 * came back from the field.
 *
 * So the file is built here instead. The page is drawn once as an image, so
 * what lands in the PDF is what the preview showed, and then every anchor in
 * it is re-added as a real link rectangle over the place it was drawn. The
 * print destination stops mattering, because there is no print dialog.
 */
export async function downloadPdf(el: HTMLElement, filename: string) {
  // A font that has not finished loading renders as a fallback in the capture.
  if (document.fonts?.ready) await document.fonts.ready;

  const box = el.getBoundingClientRect();
  // Every element is cloned with its *computed* style inlined, so the capture
  // does not depend on a stylesheet reaching the clone — which is where the
  // first attempt at this fell down, producing a page of unstyled text.
  const png = await toPng(el, {
    pixelRatio: 3,
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
    cacheBust: true,
    skipFonts: false,
    // The page is drawn onto a sheet of its own colour below, so the screen's
    // shadow and rounded corners would only show as seams at the edges.
    style: { boxShadow: 'none', borderRadius: '0' },
  });
  const maxW = PAGE.w - PAGE.margin * 2;
  const maxH = PAGE.h - PAGE.margin * 2;

  // Fit the page inside the margins, never past them, keeping the aspect.
  const ratio = box.height / box.width;
  let w = maxW;
  let h = w * ratio;
  if (h > maxH) { h = maxH; w = h / ratio; }
  const x = (PAGE.w - w) / 2;
  const y = (PAGE.h - h) / 2;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // The page's own background, edge to edge, so the sheet reads as one designed
  // surface and the one-pager's rounded corners have something to sit against
  // instead of a white border.
  const rgb = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
  if (rgb && rgb.length >= 3 && (rgb[3] === undefined || Number(rgb[3]) > 0)) {
    doc.setFillColor(Number(rgb[0]), Number(rgb[1]), Number(rgb[2]));
    doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
  }

  doc.addImage(png, 'PNG', x, y, w, h, undefined, 'FAST');

  // px → mm, the same factor the image was placed with, so a rectangle lands
  // exactly over the thing it came from.
  const k = w / box.width;
  el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.href;
    if (!href || href.startsWith('javascript:')) return;
    const r = a.getBoundingClientRect();
    if (!r.width || !r.height) return;
    doc.link(x + (r.left - box.left) * k, y + (r.top - box.top) * k, r.width * k, r.height * k, { url: href });
  });

  doc.save(filename);
}
