import { AlertTriangle } from 'lucide-react';
import Button from './Button';
import Card from './Card';
import EmptyState from './EmptyState';

/**
 * A page/section failed to load. Shown INSTEAD of an empty state so a real API
 * failure never looks like "you have no data yet". Pass `onRetry` to offer a
 * retry button (the page bumps its refresh key).
 */
export default function LoadError({
  title = "Couldn't load this",
  message = 'Something went wrong. Please try again.',
  onRetry,
  bare = false,
}) {
  const body = (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      message={message}
      action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button> : undefined}
    />
  );
  return bare ? body : <Card>{body}</Card>;
}
