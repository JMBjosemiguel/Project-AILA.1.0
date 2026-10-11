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

// Must match the backend's uploadResourceFile middleware exactly (resources
// upload limits — both the Resource Library's own uploader and the chat
// attachment picker go through the same /resources/upload endpoint).
export const ACCEPTED_RESOURCE_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export const MAX_RESOURCE_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};
