import { Download, ExternalLink, FileText, Image, Link2, Pencil, Presentation, Sparkles, Trash2 } from 'lucide-react';
import { DomainChip } from '../../common/DomainChip';
import ActionMenu from '../../common/ActionMenu';

const TYPE_META = {
  pdf: { icon: FileText, color: '#ef4444', tint: '#FFF1F2' },
  docx: { icon: FileText, color: '#2563EB', tint: '#EFF6FF' },
  ppt: { icon: Presentation, color: '#f97316', tint: '#FFF7ED' },
  pptx: { icon: Presentation, color: '#f97316', tint: '#FFF7ED' },
  link: { icon: Link2, color: '#0ea5e9', tint: '#F0F9FF' },
  image: { icon: Image, color: '#0d9488', tint: '#F0FDFA' },
};

export default function ResourceCard({ file, onSelect, selected, onOpen, onDownload, onEdit, onDelete }) {
  const meta = TYPE_META[file.type] || TYPE_META.pdf;
  const Icon = meta.icon;
  const subject = file.subjects?.[0];

  const menuItems = [
    { label: 'Open', icon: <ExternalLink size={14} />, onClick: () => onOpen?.(file) },
    { label: 'Preview Summary', icon: <Sparkles size={14} />, onClick: () => onSelect(file) },
    ...(file.file_path ? [{ label: 'Download', icon: <Download size={14} />, onClick: () => onDownload?.(file) }] : []),
    { label: 'Edit', icon: <Pencil size={14} />, onClick: () => onEdit?.(file) },
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete?.(file) },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(file);
        }
      }}
      className={[
        'flex items-center gap-3.5 w-full text-left p-5 rounded-2xl border shadow-soft transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
        selected ? 'border-primary-300 bg-primary-50' : 'border-ink-100 bg-white hover:border-primary-200',
      ].join(' ')}
    >
      <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.tint, color: meta.color }}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-800 truncate">{file.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <DomainChip subject={subject} />
          <span className="text-xs text-ink-400">{file.category_name ?? file.type}</span>
        </div>
      </div>
      <span className="text-[0.65rem] font-bold text-ink-400 uppercase flex-shrink-0">{file.type}</span>
      <ActionMenu items={menuItems} label={`Actions for ${file.title}`} />
    </div>
  );
}
