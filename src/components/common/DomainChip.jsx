import { DEFAULT_ACCENT } from '../../constants/ui';

function resolveAccent(record = {}) {
  return {
    label: record.label ?? record.name ?? record.title ?? DEFAULT_ACCENT.label,
    color: record.color ?? record.accent_color ?? DEFAULT_ACCENT.color,
    tint: record.tint ?? record.accent_tint ?? DEFAULT_ACCENT.tint,
  };
}

export function DomainDot({ subject, className = '' }) {
  const accent = resolveAccent(subject);
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`}
      style={{ background: accent.color }}
    />
  );
}

export function DomainChip({ subject, label, color, tint, className = '' }) {
  const accent = resolveAccent({ ...subject, label, color, tint });
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[0.7rem] font-semibold px-2 py-0.5 rounded-full ${className}`}
      style={{ background: accent.tint, color: accent.color }}
    >
      <DomainDot subject={accent} />
      {accent.label}
    </span>
  );
}

export function domainColor(subject) {
  return resolveAccent(subject).color;
}

export function domainTint(subject) {
  return resolveAccent(subject).tint;
}
