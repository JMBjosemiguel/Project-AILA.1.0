import { useEffect, useState } from 'react';
import { BellOff, CheckCheck, Trash2 } from 'lucide-react';
import Button from '../../../components/common/Button';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonList } from '../../../components/common/Skeleton';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { useNotificationsData } from '../../../hooks/useNotificationsData';
import {
  deleteAllNotifications, deleteNotification, markAllNotificationsRead, markNotificationRead,
} from '../../../services/api/notificationService';

export default function NotificationsPage() {
  const { data, loading } = useNotificationsData();
  const [items, setItems] = useState([]);
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    setItems(data?.notifications ?? []);
  }, [data]);

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      toast.success('All notifications marked as read.');
    } catch (error) {
      toast.error(error.message || 'Could not mark notifications as read.');
    }
  };

  const handleClick = async (notification) => {
    if (notification.is_read) return;
    try {
      await markNotificationRead(notification.id);
      setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)));
    } catch {
      // ignore
    }
  };

  const handleDelete = async (notification) => {
    const ok = await confirm({
      title: 'Delete this notification?',
      message: `"${notification.title}" will be permanently removed.`,
    });
    if (!ok) return;

    try {
      await deleteNotification(notification.id);
      setItems((current) => current.filter((item) => item.id !== notification.id));
      toast.success('Notification deleted.');
    } catch (error) {
      toast.error(error.message || 'Could not delete that notification.');
    }
  };

  const handleDeleteAll = async () => {
    const ok = await confirm({
      title: 'Delete all notifications?',
      message: 'All of your notifications will be permanently removed.',
    });
    if (!ok) return;

    try {
      await deleteAllNotifications();
      setItems([]);
      toast.success('All notifications cleared.');
    } catch (error) {
      toast.error(error.message || 'Could not clear notifications.');
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-3xl mx-auto animate-fadeUp">
      <div className="flex justify-end gap-2 mb-4">
        <Button variant="outline" size="sm" icon={<CheckCheck size={14} />} onClick={markAllRead} disabled={!items.length}>Mark all as read</Button>
        <Button variant="outline" size="sm" icon={<Trash2 size={14} />} onClick={handleDeleteAll} disabled={!items.length}>Delete all</Button>
      </div>
      <div className="flex flex-col gap-2.5">
        {loading ? (
          <SkeletonList count={4} />
        ) : items.length ? items.map((notification) => (
          <div
            key={notification.id}
            role="button"
            tabIndex={0}
            onClick={() => handleClick(notification)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleClick(notification);
              }
            }}
            className={[
              'group flex items-start gap-3.5 bg-white border rounded-xl p-4 transition-colors cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
              !notification.is_read ? 'border-primary-200' : 'border-ink-100',
            ].join(' ')}
          >
            <div className="w-9 h-9 rounded-lg bg-ink-50 flex items-center justify-center text-base flex-shrink-0">
              {notification.type?.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-800">{notification.title}</p>
              <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{notification.body}</p>
              <span className="text-[0.7rem] text-ink-300 mt-1.5 block">{new Date(notification.created_at).toLocaleString()}</span>
            </div>
            {!notification.is_read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
            <button
              onClick={(event) => { event.stopPropagation(); handleDelete(notification); }}
              aria-label={`Delete notification: ${notification.title}`}
              className="w-6 h-6 flex-shrink-0 items-center justify-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50 hidden group-hover:flex focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )) : (
          <EmptyState icon={BellOff} title="You're all caught up" message="New notifications will show up here as things happen." />
        )}
      </div>
    </div>
  );
}
