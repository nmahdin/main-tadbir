import vazirmatnArabicUrl from '@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2?url';
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
let vazirmatnDataUrl: Promise<string | null> | null = null;
const embeddedVazirmatn = () => {
  if (vazirmatnDataUrl) return vazirmatnDataUrl;
  vazirmatnDataUrl = fetch(vazirmatnArabicUrl)
    .then(response => response.ok ? response.blob() : Promise.reject(new Error('font unavailable')))
    .then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }))
    .catch(() => null);
  return vazirmatnDataUrl;
};
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

/* ------------------------------------------------------------------------- *
 * سبک‌های متن غنی
 *
 * خروجی PDF روی canvas رندر می‌شود (تنها راه حفظ شکل‌دهی فارسی و راست‌به‌چپ
 * بدون کتابخانهٔ سنگین)، پس هر «قطعهٔ متنی» باید سبک خودش را همراه داشته باشد؛
 * در غیر این صورت قلم انتخابی کاربر در فایل دانلودی نادیده گرفته می‌شود.
 * ------------------------------------------------------------------------- */

type TextAlign = 'right' | 'left' | 'center' | 'justify';

type RunStyle = {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  background: string | null;
  align: TextAlign;
  link: boolean;
};

type Run = { text: string; style: RunStyle };
type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'li';
type Block = { kind: BlockKind; marker?: string; runs: Run[] };

/** قلم انتخابی ویرایشگر (Vazirmatn/Tahoma/Arial) به پشتهٔ قابل‌استفاده در canvas. */
const FONT_STACKS: Record<string, string> = {
  vazirmatn: '"Vazirmatn Variable", Vazirmatn, Vazir, Tahoma, sans-serif',
  tahoma: 'Tahoma, "Segoe UI", sans-serif',
  arial: 'Arial, "Liberation Sans", sans-serif',
};
const DEFAULT_FAMILY = FONT_STACKS.vazirmatn;

const resolveFamily = (raw: string | null | undefined): string => {
  const name = (raw || '').replace(/["']/g, '').split(',')[0].trim().toLowerCase();
  if (!name) return DEFAULT_FAMILY;
  if (name.startsWith('vazir')) return FONT_STACKS.vazirmatn;
  if (name === 'tahoma' || name === 'segoe ui') return FONT_STACKS.tahoma;
  if (name === 'arial' || name === 'helvetica' || name === 'liberation sans') return FONT_STACKS.arial;
  return DEFAULT_FAMILY;
};

const SIZE_WORDS: Record<string, number> = { small: 20, medium: 26, large: 32, 'x-large': 40, 'xx-large': 48 };

const resolveSize = (raw: string | null | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  if (SIZE_WORDS[value]) return SIZE_WORDS[value];
  const match = /^([\d.]+)(px|pt|rem|em)$/.exec(value);
  if (!match) return fallback;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  if (match[2] === 'px') return Math.min(Math.max(amount, 12), 72);
  if (match[2] === 'pt') return Math.min(Math.max(amount * 1.333, 12), 96);
  return Math.min(Math.max(amount * 16, 12), 72);
};

const mergeStyle = (base: RunStyle, element: Element): RunStyle => {
  const next: RunStyle = { ...base };
  const tag = element.tagName;
  if (tag === 'STRONG' || tag === 'B') next.weight = 700;
  if (tag === 'EM' || tag === 'I') next.italic = true;
  if (tag === 'U') next.underline = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true;
  if (tag === 'A') { next.link = true; next.color = next.link && base.color === '#0f172a' ? '#1d4ed8' : next.color; }
  if (tag === 'H1') next.size = Math.max(next.size, 34);
  if (tag === 'H2') next.size = Math.max(next.size, 30);
  if (tag === 'H3') next.size = Math.max(next.size, 26);
  if (tag === 'H1' || tag === 'H2' || tag === 'H3') next.weight = 700;
  if (tag === 'BLOCKQUOTE') { next.color = '#475569'; next.size = Math.max(next.size, 24); }

  const style = element.getAttribute('style');
  if (!style) return next;

  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property === 'font-family') next.family = resolveFamily(value);
    else if (property === 'font-size') next.size = resolveSize(value, next.size);
    else if (property === 'font-weight') next.weight = /^(bold|[6-9]00)$/i.test(value) ? 700 : 400;
    else if (property === 'font-style') next.italic = /italic|oblique/i.test(value);
    else if (property === 'text-decoration' || property === 'text-decoration-line') {
      if (/underline/i.test(value)) next.underline = true;
      if (/line-through/i.test(value)) next.strike = true;
    } else if (property === 'color') next.color = value;
    else if (property === 'background-color') next.background = /^(transparent|none)$/i.test(value) ? null : value;
    else if (property === 'text-align' && /^(right|left|center|justify)$/i.test(value)) next.align = value.toLowerCase() as TextAlign;
  }
  return next;
};

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'SECTION', 'TABLE']);

const createBaseStyle = (): RunStyle => ({
  family: DEFAULT_FAMILY, size: 26, weight: 400, italic: false, underline: false, strike: false,
  color: '#0f172a', background: null, align: 'right', link: false,
});

const collectRuns = (element: Element, style: RunStyle, runs: Run[]) => {
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ text: node.textContent || '', style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    if (child.tagName === 'BR') { runs.push({ text: '\n', style }); return; }
    if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') return;
    const nextStyle = mergeStyle(style, child);
    if (BLOCK_TAGS.has(child.tagName)) runs.push({ text: '\n', style: nextStyle });
    collectRuns(child, nextStyle, runs);
    if (BLOCK_TAGS.has(child.tagName)) runs.push({ text: '\n', style: nextStyle });
  });
};

const collectBlocks = (container: Element | DocumentFragment, style: RunStyle, out: Block[]) => {
  container.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) out.push({ kind: 'p', runs: [{ text, style }] });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.tagName === 'BR') { out.push({ kind: 'p', runs: [{ text: '', style }] }); return; }
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;
    const nextStyle = mergeStyle(style, element);
    const tag = element.tagName;

    if (tag === 'UL' || tag === 'OL') {
      const items = Array.from(element.children).filter(child => child.tagName === 'LI');
      items.forEach((item, index) => {
        const runs: Run[] = [];
        collectRuns(item, mergeStyle(nextStyle, item), runs);
        if (runs.some(run => run.text.trim())) {
          out.push({ kind: 'li', marker: tag === 'OL' ? `${index + 1}.` : '•', runs });
        }
      });
      return;
    }

    if (tag === 'P' || tag === 'DIV' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'BLOCKQUOTE' || tag === 'SECTION') {
      const hasBlocks = Array.from(element.children).some(child => BLOCK_TAGS.has(child.tagName));
      if (hasBlocks && tag !== 'BLOCKQUOTE') { collectBlocks(element, nextStyle, out); return; }
      const runs: Run[] = [];
      collectRuns(element, nextStyle, runs);
      const kind: BlockKind = tag === 'H1' ? 'h1' : tag === 'H2' ? 'h2' : tag === 'H3' ? 'h3' : tag === 'BLOCKQUOTE' ? 'blockquote' : 'p';
      out.push({ kind, runs });
      return;
    }

    const runs: Run[] = [];
    collectRuns(element, nextStyle, runs);
    if (runs.some(run => run.text.trim())) out.push({ kind: 'p', runs });
  });
};

const buildBlocks = (html: string): Block[] => {
  if (typeof DOMParser === 'undefined') return [];
  const parsed = new DOMParser().parseFromString(sanitizeRichTextHtml(html), 'text/html');
  const blocks: Block[] = [];
  collectBlocks(parsed.body, createBaseStyle(), blocks);
  return blocks;
};

/** خانوادهٔ قلم غالب در متن؛ در خروجی Word به‌عنوان قلم پایهٔ سند استفاده می‌شود. */
const dominantFamily = (blocks: Block[]) => {
  const counts = new Map<string, number>();
  blocks.forEach(block => block.runs.forEach(run => {
    if (!run.text.trim()) return;
    counts.set(run.style.family, (counts.get(run.style.family) || 0) + run.text.trim().length);
  }));
  let winner = DEFAULT_FAMILY;
  let best = 0;
  counts.forEach((count, family) => { if (count > best) { best = count; winner = family; } });
  return winner;
};

/** نام قلمِ سند برای Word: قلمِ نخستِ همان پشتهٔ canvas. */
const wordFamilyName = (stack: string) => {
  const first = stack.split(',')[0].trim().replace(/["']/g, '');
  if (/vazir/i.test(first)) return { name: 'Vazirmatn Download', fallback: 'Vazirmatn Variable' };
  return { name: first, fallback: first };
};

type Token = { text: string; style: RunStyle; break?: boolean };

const fontOf = (style: RunStyle, scale = 1) => {
  const prefix = style.italic ? 'italic ' : '';
  return `${prefix}${style.weight} ${Math.round(style.size * scale)}px ${style.family}`;
};

const tokenize = (runs: Run[]): Token[] => {
  const tokens: Token[] = [];
  runs.forEach(run => {
    const normalized = run.text.replace(/\u00a0/g, ' ');
    const parts = normalized.split(/(\n|\s+)/);
    parts.forEach(part => {
      if (!part) return;
      if (part === '\n') { tokens.push({ text: '', style: run.style, break: true }); return; }
      if (!part.trim()) { return; }
      tokens.push({ text: part, style: run.style });
    });
  });
  return tokens;
};

/** یک خط = چند «قطعه» با سبک یکسان؛ درون هر قطعه، مرورگر ترتیب دوجهته را حفظ می‌کند. */
type Segment = { text: string; style: RunStyle };

const renderStyledPdfPages = async (title: string, html: string) => {
  const width = 1240;
  const height = 1754;
  const margin = 96;
  const maxWidth = width - margin * 2;
  const blocks = buildBlocks(html);
  const families = new Set<string>([DEFAULT_FAMILY]);
  blocks.forEach(block => block.runs.forEach(run => { if (run.text.trim()) families.add(run.style.family); }));

  const paint = document.createElement('canvas');
  paint.width = 8; paint.height = 8;
  const measureContext = paint.getContext('2d')!;
  const spaceWidthOf = (style: RunStyle) => { measureContext.font = fontOf(style); return measureContext.measureText(' ').width || style.size * 0.28; };

  if (document.fonts) {
    await document.fonts.ready;
    await Promise.all(Array.from(families).flatMap(family => [400, 700].map(weight =>
      document.fonts.load(`${weight} 26px ${family}`).catch(() => undefined))));
  }

  const pages: HTMLCanvasElement[] = [];
  let canvas = document.createElement('canvas');
  let context = canvas.getContext('2d')!;
  let y = margin;

  const createPage = (withTitle: boolean) => {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.direction = 'rtl';
    context.textBaseline = 'alphabetic';
    pages.push(canvas);
    y = margin;
    if (withTitle) {
      context.font = `700 38px ${DEFAULT_FAMILY}`;
      context.fillStyle = '#0f172a';
      context.textAlign = 'right';
      context.fillText(title, width - margin, y + 38);
      y += 38 + 34;
      context.strokeStyle = '#e2e8f0';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(margin, y);
      context.lineTo(width - margin, y);
      context.stroke();
      y += 30;
    }
  };
  createPage(true);

  const ensureSpace = (size: number) => {
    if (y + size * 1.6 > height - margin) createPage(false);
  };

  const drawLine = (segments: Segment[], lineSize: number, align: TextAlign, indent: number, marker?: string) => {
    const availableRight = width - margin - indent;
    const effectiveAlign: TextAlign = align === 'justify' ? 'right' : align;

    const firstStyle = segments[0]?.style || createBaseStyle();
    const prefix = marker ? `${marker} ` : '';
    let total = 0;
    if (prefix) {
      context.font = fontOf(firstStyle);
      total += context.measureText(prefix).width + spaceWidthOf(firstStyle);
    }
    segments.forEach((segment, index) => {
      context.font = fontOf(segment.style);
      total += context.measureText(segment.text).width;
      if (index < segments.length - 1) total += spaceWidthOf(segment.style);
    });

    let cursor = availableRight;
    if (effectiveAlign === 'center') cursor = width / 2 + total / 2;
    else if (effectiveAlign === 'left') cursor = margin + indent + total;

    const baseline = y + lineSize;

    const drawDecoration = (style: RunStyle, left: number, right: number) => {
      context.strokeStyle = style.link ? '#1d4ed8' : style.color;
      context.lineWidth = Math.max(1, style.size * 0.05);
      if (style.underline || style.link) {
        context.beginPath();
        context.moveTo(left, baseline + style.size * 0.16);
        context.lineTo(right, baseline + style.size * 0.16);
        context.stroke();
      }
      if (style.strike) {
        context.beginPath();
        context.moveTo(left, baseline - style.size * 0.28);
        context.lineTo(right, baseline - style.size * 0.28);
        context.stroke();
      }
    };

    if (prefix) {
      context.font = fontOf(firstStyle);
      const prefixWidth = context.measureText(prefix).width;
      context.fillStyle = firstStyle.color;
      context.textAlign = 'right';
      context.fillText(prefix, cursor, baseline);
      cursor -= prefixWidth + spaceWidthOf(firstStyle);
    }

    segments.forEach((segment, index) => {
      context.font = fontOf(segment.style);
      const segmentWidth = context.measureText(segment.text).width;
      const left = cursor - segmentWidth;
      if (segment.style.background) {
        context.fillStyle = segment.style.background;
        context.fillRect(left - 2, baseline - segment.style.size, segmentWidth + 4, segment.style.size * 1.35);
      }
      context.fillStyle = segment.style.color;
      context.textAlign = 'right';
      context.fillText(segment.text, cursor, baseline);
      drawDecoration(segment.style, left, cursor);
      cursor = left;
      if (index < segments.length - 1) cursor -= spaceWidthOf(segment.style);
    });
    y += lineSize * 1.6;
  };

  for (const block of blocks) {
    const tokens = tokenize(block.runs);
    const indent = block.kind === 'blockquote' ? 28 : block.kind === 'li' ? 24 : 0;
    if (!tokens.length) { y += 22; continue; }

    const lines: Token[][] = [];
    let line: Token[] = [];
    let lineWidth = 0;
    for (const token of tokens) {
      if (token.break) { if (line.length) { lines.push(line); line = []; lineWidth = 0; } else { lines.push([]); } continue; }
      context.font = fontOf(token.style);
      const tokenWidth = context.measureText(token.text).width;
      const gap = line.length ? spaceWidthOf(token.style) : 0;
      if (line.length && lineWidth + gap + tokenWidth > maxWidth - indent) { lines.push(line); line = []; lineWidth = 0; }
      lineWidth += (line.length ? spaceWidthOf(token.style) : 0) + tokenWidth;
      line.push(token);
    }
    if (line.length) lines.push(line);

    const blockSize = Math.max(...tokens.map(token => token.style.size));

    if (block.kind === 'blockquote') {
      const startY = y;
      lines.forEach(tokensOfLine => {
        if (!tokensOfLine.length) { y += blockSize * 0.8; return; }
        const size = Math.max(...tokensOfLine.map(token => token.style.size));
        ensureSpace(size);
        drawLine(groupSegments(tokensOfLine), size, tokensOfLine[0].style.align, indent);
          });
      context.fillStyle = '#cbd5e1';
      context.fillRect(width - margin + 8, startY - blockSize, 4, Math.max(y - blockSize * 1.6 - startY + blockSize, 12));
      y += 12;
      continue;
    }

    lines.forEach((tokensOfLine, index) => {
      if (!tokensOfLine.length) { y += blockSize * 0.8; return; }
      const size = Math.max(...tokensOfLine.map(token => token.style.size));
      ensureSpace(size);
      const marker = block.kind === 'li' && index === 0 ? block.marker : undefined;
      drawLine(groupSegments(tokensOfLine), size, tokensOfLine[0].style.align, indent, marker);
    });

    if (block.kind === 'h1' || block.kind === 'h2' || block.kind === 'h3') y += Math.max(10, blockSize * 0.3);
    else if (block.kind !== 'li') y += Math.max(12, blockSize * 0.4);
  }

  return Promise.all(pages.map(async page => {
    const data = page.toDataURL('image/jpeg', 0.92).split(',')[1];
    const binary = atob(data);
    const imageBytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) imageBytes[index] = binary.charCodeAt(index);
    return { bytes: imageBytes, width: page.width, height: page.height };
  }));
};

const groupSegments = (tokens: Token[]): Segment[] => {
  const segments: Segment[] = [];
  tokens.forEach(token => {
    const last = segments[segments.length - 1];
    if (last && stylesEqual(last.style, token.style)) last.text += ` ${token.text}`;
    else segments.push({ text: token.text, style: token.style });
  });
  return segments;
};

const stylesEqual = (left: RunStyle, right: RunStyle) => left.family === right.family && left.size === right.size
  && left.weight === right.weight && left.italic === right.italic && left.underline === right.underline
  && left.strike === right.strike && left.color === right.color && left.background === right.background
  && left.link === right.link;

export async function downloadTextAsset(title: string, richTextHtml: string, format: TextAssetFormat) {
  const name = safeName(title);
  const plain = richTextToPlainText(richTextHtml);
  if (format === 'txt') {
    saveBlob(new Blob(['\uFEFF', plain], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
    return;
  }
  if (format === 'doc') {
    const fontData = await embeddedVazirmatn();
    // قلم غالب متن در سند Word هم اعمال می‌شود؛ @font-face وزیرمتن برای وقتی است
    // که کاربر همان قلم را انتخاب کرده باشد و سیستم مقصد فونت نصب‌شده نداشته باشد.
    const family = wordFamilyName(dominantFamily(buildBlocks(richTextHtml)));
    const fontFace = fontData && family.name === 'Vazirmatn Download'
      ? `@font-face{font-family:'Vazirmatn Download';src:url('${fontData}') format('woff2');font-weight:100 900;font-style:normal}`
      : '';
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${fontFace}body{font-family:'${family.name}','${family.fallback}',Tahoma,sans-serif;direction:rtl;line-height:2;padding:32px}h1{font-size:22px}</style></head><body><h1>${safeName(title)}</h1>${sanitizeRichTextHtml(richTextHtml)}</body></html>`;
    saveBlob(new Blob(['\uFEFF', html], { type: 'application/msword;charset=utf-8' }), `${name}.doc`);
    return;
  }
  const pages = await renderStyledPdfPages(title, richTextHtml);
  saveBlob(imagePdf(pages), `${name}.pdf`);
}
