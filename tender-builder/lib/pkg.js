import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
const STRIP = 30; // footer strip added BELOW every page, so content is never covered
const safe = (s) => String(s ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

export async function buildPackage(tn, items) {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const cover = out.addPage([595, 842]);

  const counts = [];
  for (const { file } of items) {
    const src = await PDFDocument.load(file.bytes);
    const pages = src.getPages();
    const emb = await out.embedPages(pages);
    pages.forEach((p, i) => {
      const { width, height } = p.getSize();
      const pg = out.addPage([width, height + STRIP]);
      pg.drawPage(emb[i], { x: 0, y: STRIP });
    });
    counts.push(pages.length);
  }

  // cover
  const ink = rgb(0.1, 0.15, 0.25);
  let y = 770;
  cover.drawText('TENDER DOCUMENT PACKAGE', { x: 50, y, size: 12, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 34;
  cover.drawText(safe(tn.title).slice(0, 60), { x: 50, y, size: 22, font: bold, color: ink });
  y -= 36;
  const rows = [
    ['Tender ID', tn.tender_id], ['Procuring entity', tn.procuring_entity], ['Bidder', tn.bidder],
    ['Submission deadline', tn.submission_deadline], ['Package created', new Date().toISOString().slice(0, 10)],
  ];
  for (const [k, v] of rows) {
    cover.drawText(k + ':', { x: 50, y, size: 11, font: bold, color: ink });
    cover.drawText(safe(v).slice(0, 70), { x: 190, y, size: 11, font, color: ink });
    y -= 20;
  }
  y -= 14;
  cover.drawText('Included documents (in order)', { x: 50, y, size: 13, font: bold, color: ink });
  y -= 22;
  let start = 2;
  items.forEach(({ req }, i) => {
    if (y < 50) return;
    const line = `${i + 1}. ${safe(req.title_en)}`.slice(0, 70);
    cover.drawText(line, { x: 50, y, size: 10.5, font, color: ink });
    cover.drawText(`p. ${start}${counts[i] > 1 ? '-' + (start + counts[i] - 1) : ''}`, { x: 480, y, size: 10.5, font, color: ink });
    start += counts[i];
    y -= 16;
  });

  // footer on every page incl. cover: "<tender_id> | Page X of Y"
  const all = out.getPages();
  all.forEach((pg, i) => {
    const t = `${safe(tn.tender_id)} | Page ${i + 1} of ${all.length}`;
    const w = font.widthOfTextAtSize(t, 10);
    pg.drawText(t, { x: (pg.getWidth() - w) / 2, y: 10, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  });
  return out.save();
}
