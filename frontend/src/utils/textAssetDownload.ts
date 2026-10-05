import { richTextToPlainText, sanitizeRichTextHtml } from '../components/common/RichTextEditor';

export type TextAssetFormat = 'txt' | 'doc' | 'pdf';

const safeName = (title: string) => (title.trim() || 'دارایی-متنی').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const bytes = (value: string) => new TextEncoder().encode(value);
const concatBytes = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach(part => { result.set(part, offset); offset += part.length; });
  return result;
};

/** Build a standards-compliant image PDF. Rendering through canvas preserves RTL/Persian shaping. */
const imagePdf = (images: Array<{ bytes: Uint8Array; width: number; height: number }>) => {
  const objects = new Map<number, Uint8Array>();
  const pageIds = images.map((_, index) => 3 + index * 3);
  objects.set(1, bytes('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, bytes(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`));
  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const draw = 'q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n';
    objects.set(pageId, bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.set(contentId, bytes(`<< /Length ${bytes(draw).length} >>\nstream\n${draw}endstream`));
    objects.set(imageId, concatBytes([
      bytes(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),
      image.bytes,
      bytes('\nendstream'),
    ]));
  });

  const maxId = Math.max(...objects.keys());
  const parts: Uint8Array[] = [bytes('%PDF-1.4\n%PDF-RTL\n')];
  const offsets = new Array(maxId + 1).fill(0);
  let length = parts[0].length;
  for (let id = 1; id <= maxId; id++) {
    const object = objects.get(id)!;
    offsets[id] = length;
    const part = concatBytes([bytes(`${id} 0 obj\n`), object, bytes('\nendobj\n')]);
    parts.push(part);
    length += part.length;
  }
  const xrefOffset = length;
  const xref = [`xref\r\n0 ${maxId + 1}\r\n`, '0000000000 65535 f\r\n'];
  for (let id = 1; id <= maxId; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n\r\n`);
  xref.push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  parts.push(bytes(xref.join('')));
  return new Blob([concatBytes(parts)], { type: 'application/pdf' });
};

const renderPdfPages = async (title: string, plainText: string) => {
  await document.fonts?.ready;
  const width = 1240;
  const height = 1754;
  const margin = 96;
  const bodyFont = '26px Vazirmatn, Tahoma, sans-serif';
  const titleFont = 'bold 38px Vazirmatn, Tahoma, sans-serif';
  const lineHeight = 45;
  const pages: HTMLCanvasElement[] = [];
  let canvas = document.createElement('canvas');
  let context = canvas.getContext('2d')!;
  let y = margin;

  const createPage = () => {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#0f172a';
    context.direction = 'rtl';
    context.textAlign = 'right';
    pages.push(canvas);
    y = margin;
  };
  const newBodyPage = () => { createPage(); context.font = bodyFont; };
  createPage();
  context.font = titleFont;
  context.fillText(title, width - margin, y);
  y += 76;
  context.strokeStyle = '#e2e8f0';
  context.beginPath(); context.moveTo(margin, y - 28); context.lineTo(width - margin, y - 28); context.stroke();
  context.font = bodyFont;

  const maxWidth = width - margin * 2;
  const paragraphs = (plainText || 'متن خالی است.').replace(/\r/g, '').split('\n');
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words.length ? words : ['']) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
    for (const row of lines) {
      if (y > height - margin) newBodyPage();
      context.fillText(row, width - margin, y);
      y += lineHeight;
    }
    y += 15;
  }
  return Promise.all(pages.map(async page => {
    const data = page.toDataURL('image/jpeg', 0.9).split(',')[1];
    const binary = atob(data);
    const imageBytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) imageBytes[index] = binary.charCodeAt(index);
    return { bytes: imageBytes, width: page.width, height: page.height };
  }));
};

export async function downloadTextAsset(title: string, richTextHtml: string, format: TextAssetFormat) {
  const name = safeName(title);
  const plain = richTextToPlainText(richTextHtml);
  if (format === 'txt') {
    saveBlob(new Blob(['\uFEFF', plain], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
    return;
  }
  if (format === 'doc') {
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;line-height:2;padding:32px}h1{font-size:22px}</style></head><body><h1>${name}</h1>${sanitizeRichTextHtml(richTextHtml)}</body></html>`;
    saveBlob(new Blob(['\uFEFF', html], { type: 'application/msword;charset=utf-8' }), `${name}.doc`);
    return;
  }
  const pages = await renderPdfPages(title, plain);
  saveBlob(imagePdf(pages), `${name}.pdf`);
}
