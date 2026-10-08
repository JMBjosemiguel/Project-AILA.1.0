export const DEFAULT_ACCENT = {
  color: '#64748B',
  tint: '#F1F5F9',
  label: 'Unassigned',
};

export const RESOURCE_TYPES = ['all', 'pdf', 'docx', 'ppt', 'pptx', 'image', 'link'];

// Display labels for RESOURCE_TYPES — CSS capitalize/uppercase can't tell an
// acronym (PDF, DOCX) from a plain word (Image, Link), so this is explicit.
export const RESOURCE_TYPE_LABELS = {
  all: 'All',
  pdf: 'PDF',
  docx: 'DOCX',
  ppt: 'PPT',
  pptx: 'PPTX',
  image: 'Image',
  link: 'Link',
};

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};
