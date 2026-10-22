import React from 'react';
import { FileText } from 'lucide-react';
import { Modal } from './Primitives';
import { RichTextContent } from './RichTextEditor';
import { TextAssetActions } from './TextAssetActions';

export function TextAssetViewer({ open, onClose, title, html, canDownload = true }: {
  open: boolean;
  onClose: () => void;
  title: string;
  html: string;
  canDownload?: boolean;
}) {
  return <Modal open={open} onClose={onClose} title={title} description="نمایش کامل دارایی متنی" icon={<FileText className="h-5 w-5" />} size="xl" panelScroll={false}>
    <div className="flex max-h-[calc(94dvh-82px)] min-h-[55dvh] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8"><RichTextContent html={html} emptyText="متن خالی است." className="mx-auto max-w-4xl text-sm leading-8" /></div>
      {canDownload && <footer className="relative z-20 flex shrink-0 justify-end border-t border-slate-200 bg-white px-5 py-3"><TextAssetActions title={title} html={html} onView={() => undefined} canDownload showView={false} /></footer>}
    </div>
  </Modal>;
}
