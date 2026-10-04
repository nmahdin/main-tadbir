import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Italic,
  Link,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';
import { Select } from './Primitives';

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'BLOCKQUOTE',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'SPAN', 'FONT',
]);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM']);
const SAFE_FONT_FAMILIES = new Set(['Vazirmatn', 'Tahoma', 'Arial']);
const FORMATTED_TAG = /<\/?(?:p|div|br|h[1-3]|blockquote|strong|b|em|i|u|s|ul|ol|li|a|span|font)\b/i;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const safeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return '';
};

const safeStyle = (style: string) => {
  const declarations: string[] = [];
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if ((property === 'color' || property === 'background-color')
      && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(value)) {
      declarations.push(`${property}: ${value}`);
    } else if (property === 'text-align' && /^(right|left|center|justify)$/i.test(value)) {
      declarations.push(`${property}: ${value.toLowerCase()}`);
    } else if (property === 'font-size' && /^(?:[8-9]|[1-6]\d|7[0-2])(?:px|pt)$|^(?:0\.\d+|[1-3](?:\.\d+)?)rem$|^(?:small|medium|large|x-large|xx-large)$/i.test(value)) {
      declarations.push(`${property}: ${value.toLowerCase()}`);
    } else if (property === 'font-family') {
      const family = value.replace(/["']/g, '').split(',')[0].trim();
      if (SAFE_FONT_FAMILIES.has(family)) declarations.push(`${property}: ${family}`);
    }
  }
  return declarations.join('; ');
};

/**
 * Browser-side allow-list sanitizer. The API repeats this validation before
 * persistence; this copy keeps pasted markup safe before it enters React.
 */
export const sanitizeRichTextHtml = (value: string): string => {
  if (!value) return '';
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') return escapeHtml(value);
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  const output = document.implementation.createHTMLDocument('');

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return output.createTextNode(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const source = node as HTMLElement;
    if (DROP_WITH_CONTENT.has(source.tagName)) return null;
    if (!ALLOWED_TAGS.has(source.tagName)) {
      const fragment = output.createDocumentFragment();
      source.childNodes.forEach(child => { const clean = cleanNode(child); if (clean) fragment.appendChild(clean); });
      return fragment;
    }
    const element = output.createElement(source.tagName === 'FONT' ? 'span' : source.tagName.toLowerCase());
    const legacyFontStyles: string[] = [];
    if (source.tagName === 'FONT') {
      const sizeMap: Record<string, string> = { '1': 'small', '2': 'small', '3': 'medium', '4': 'large', '5': 'x-large', '6': 'xx-large', '7': 'xx-large' };
      if (source.getAttribute('color')) legacyFontStyles.push(`color: ${source.getAttribute('color')}`);
      if (source.getAttribute('face')) legacyFontStyles.push(`font-family: ${source.getAttribute('face')}`);
      if (source.getAttribute('size') && sizeMap[source.getAttribute('size')!]) legacyFontStyles.push(`font-size: ${sizeMap[source.getAttribute('size')!]}`);
    }
    const style = safeStyle([source.getAttribute('style') || '', ...legacyFontStyles].join(';'));
    if (style) element.setAttribute('style', style);
    if (source.tagName === 'A') {
      const href = safeUrl(source.getAttribute('href') || '');
      if (href) {
        element.setAttribute('href', href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    source.childNodes.forEach(child => { const clean = cleanNode(child); if (clean) element.appendChild(clean); });
    return element;
  };

  const wrapper = output.createElement('div');
  parsed.body.childNodes.forEach(node => { const clean = cleanNode(node); if (clean) wrapper.appendChild(clean); });
  return wrapper.innerHTML;
};

export const normalizeRichTextHtml = (value: string): string => {
  if (!value) return '';
  const source = FORMATTED_TAG.test(value)
    ? value
    : escapeHtml(value).replace(/\r\n?/g, '\n').split('\n').map(line => `<div>${line || '<br>'}</div>`).join('');
  return sanitizeRichTextHtml(source);
};

export const richTextToPlainText = (value: string): string => {
  if (!value) return '';
  if (typeof DOMParser === 'undefined') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const parsed = new DOMParser().parseFromString(normalizeRichTextHtml(value), 'text/html');
  parsed.body.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  parsed.body.querySelectorAll('p,div,h1,h2,h3,blockquote,li').forEach(block => block.append('\n'));
  return (parsed.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};

export const hasRichTextContent = (value: string) => richTextToPlainText(value).length > 0;

const TOOL_BUTTON = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40';

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  label = 'متن یادداشت',
  placeholder = 'متن را وارد کنید…',
  maxLength = 1_000_000,
  minHeight = 180,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const plainLength = richTextToPlainText(value).length;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = normalizeRichTextHtml(value);
    if (editor.innerHTML !== next) editor.innerHTML = next;
  }, [value, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  const commit = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const clean = sanitizeRichTextHtml(editor.innerHTML);
    if (richTextToPlainText(clean).length > maxLength) {
      document.execCommand('undo');
      return;
    }
    if (editor.innerHTML !== clean) editor.innerHTML = clean;
    onChange(clean);
  };

  const command = (name: string, commandValue?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(name, false, commandValue);
    commit();
  };

  const linkSelection = () => {
    const entered = window.prompt('نشانی پیوند را وارد کنید:');
    if (entered === null) return;
    const href = safeUrl(entered);
    if (!href) return;
    command('createLink', href);
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2" role="toolbar" aria-label="ابزارهای قالب‌بندی متن">
      <Select
        aria-label="سبک پاراگراف"
        disabled={disabled}
        defaultValue="div"
        onChange={event => command('formatBlock', event.target.value)}
        className="h-8 w-32 py-1 text-[10px]"
      >
        <option value="div">متن عادی</option>
        <option value="h1">عنوان ۱</option>
        <option value="h2">عنوان ۲</option>
        <option value="h3">عنوان ۳</option>
        <option value="blockquote">نقل‌قول</option>
      </Select>
      <Select
        aria-label="اندازه قلم"
        disabled={disabled}
        defaultValue="3"
        onChange={event => command('fontSize', event.target.value)}
        className="h-8 w-24 py-1 text-[10px]"
      >
        <option value="2">کوچک</option><option value="3">معمولی</option><option value="4">متوسط</option><option value="5">بزرگ</option><option value="6">خیلی بزرگ</option>
      </Select>
      <Select
        aria-label="نوع قلم"
        disabled={disabled}
        defaultValue="Vazirmatn"
        onChange={event => command('fontName', event.target.value)}
        className="h-8 w-24 py-1 text-[10px]"
      >
        <option value="Vazirmatn">وزیرمتن</option><option value="Tahoma">Tahoma</option><option value="Arial">Arial</option>
      </Select>
      <ToolbarButton label="پررنگ" disabled={disabled} onClick={() => command('bold')}><Bold /></ToolbarButton>
      <ToolbarButton label="مورب" disabled={disabled} onClick={() => command('italic')}><Italic /></ToolbarButton>
      <ToolbarButton label="زیرخط" disabled={disabled} onClick={() => command('underline')}><Underline /></ToolbarButton>
      <ToolbarButton label="خط‌خورده" disabled={disabled} onClick={() => command('strikeThrough')}><Strikethrough /></ToolbarButton>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarButton label="فهرست نشانه‌دار" disabled={disabled} onClick={() => command('insertUnorderedList')}><List /></ToolbarButton>
      <ToolbarButton label="فهرست شماره‌دار" disabled={disabled} onClick={() => command('insertOrderedList')}><ListOrdered /></ToolbarButton>
      <ToolbarButton label="راست‌چین" disabled={disabled} onClick={() => command('justifyRight')}><AlignRight /></ToolbarButton>
      <ToolbarButton label="وسط‌چین" disabled={disabled} onClick={() => command('justifyCenter')}><AlignCenter /></ToolbarButton>
      <ToolbarButton label="چپ‌چین" disabled={disabled} onClick={() => command('justifyLeft')}><AlignLeft /></ToolbarButton>
      <ToolbarButton label="تراز دوطرفه" disabled={disabled} onClick={() => command('justifyFull')}><AlignJustify /></ToolbarButton>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <label className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-[9px] font-bold text-slate-500 hover:bg-white" title="رنگ متن">
        متن<input aria-label="رنگ متن" type="color" disabled={disabled} defaultValue="#334155" onChange={event => command('foreColor', event.target.value)} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" />
      </label>
      <label className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-[9px] font-bold text-slate-500 hover:bg-white" title="رنگ زمینه متن">
        زمینه<input aria-label="رنگ زمینه متن" type="color" disabled={disabled} defaultValue="#fef08a" onChange={event => command('hiliteColor', event.target.value)} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" />
      </label>
      <ToolbarButton label="افزودن پیوند" disabled={disabled} onClick={linkSelection}><Link /></ToolbarButton>
      <ToolbarButton label="حذف پیوند" disabled={disabled} onClick={() => command('unlink')}><Unlink /></ToolbarButton>
      <ToolbarButton label="پاک‌کردن قالب‌بندی" disabled={disabled} onClick={() => command('removeFormat')}><Eraser /></ToolbarButton>
      <ToolbarButton label="واگرد" disabled={disabled} onClick={() => command('undo')}><Undo2 /></ToolbarButton>
      <ToolbarButton label="ازنو" disabled={disabled} onClick={() => command('redo')}><Redo2 /></ToolbarButton>
      <span className="flex-1" />
      <ToolbarButton label={expanded ? 'خروج از تمام‌صفحه' : 'نمایش تمام‌صفحه'} disabled={disabled} onClick={() => setExpanded(current => !current)}>
        {expanded ? <Minimize2 /> : <Maximize2 />}
      </ToolbarButton>
    </div>
  );

  const editor = (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs ${expanded ? 'flex h-full w-full flex-col rounded-none border-0' : ''}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
        <label className="text-[11px] font-black text-slate-700">{label}</label>
        <span className={`text-[9px] ${plainLength > maxLength ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
          {plainLength.toLocaleString('fa-IR')} / {maxLength.toLocaleString('fa-IR')}
        </span>
      </div>
      {toolbar}
      <div className={`relative ${expanded ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
        {!plainLength && <span className="pointer-events-none absolute right-4 top-3 text-xs text-slate-400">{placeholder}</span>}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          onInput={commit}
          onBlur={commit}
          className="rich-text-editor prose max-w-none overflow-y-auto px-4 py-3 text-sm leading-8 text-slate-800 outline-none [&_a]:text-indigo-700 [&_a]:underline [&_blockquote]:border-r-4 [&_blockquote]:border-indigo-200 [&_blockquote]:pr-3 [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-black [&_h3]:text-base [&_h3]:font-extrabold [&_ol]:list-decimal [&_ol]:pr-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pr-6"
          style={{ minHeight: expanded ? 'calc(100dvh - 132px)' : minHeight }}
        />
      </div>
    </section>
  );

  if (expanded) return createPortal(<div dir="rtl" className="fixed inset-0 z-[120] bg-white">{editor}</div>, document.body);
  return editor;
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      className={`${TOOL_BUTTON} [&>svg]:h-3.5 [&>svg]:w-3.5`}
    >
      {children}
    </button>
  );
}

export function RichTextContent({ html, emptyText = 'متنی برای نمایش ثبت نشده است.', className = '' }: { html?: string | null; emptyText?: string; className?: string }) {
  const safe = normalizeRichTextHtml(html || '');
  if (!richTextToPlainText(safe)) return <p className={className}>{emptyText}</p>;
  return (
    <div
      className={`rich-text-content break-words text-sm leading-8 text-slate-700 [&_a]:text-indigo-700 [&_a]:underline [&_blockquote]:border-r-4 [&_blockquote]:border-indigo-200 [&_blockquote]:pr-3 [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-black [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-black [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-extrabold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pr-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pr-6 ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
