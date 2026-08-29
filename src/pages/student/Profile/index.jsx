import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import { useToast } from '../../../components/common/Toast';
import { useProfileData } from '../../../hooks/useProfileData';
import { changePassword, updateProfile } from '../../../services/api/profileService';

export default function ProfilePage() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data } = useProfileData(refreshVersion);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ program: '', year_level: '', bio: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' });
  const [passwordStatus, setPasswordStatus] = useState('');
  const toast = useToast();

  const user = data?.user;
  const profile = data?.profile;
  const name = user ? `${user.first_name} ${user.last_name}` : 'Profile pending';
  const avatarLetter = user?.first_name?.[0] ?? 'A';

  useEffect(() => {
    if (profile) {
      setForm({
        program: profile.program ?? '',
        year_level: profile.year_level ?? '',
        bio: profile.bio ?? '',
      });
    }
  }, [profile]);

  const handleEditToggle = async () => {
    if (!editing) {
      setEditing(true);
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        program: form.program || null,
        year_level: form.year_level ? Number(form.year_level) : null,
        bio: form.bio || null,
      });
      setEditing(false);
      setRefreshVersion((version) => version + 1);
      toast.success('Profile updated.');
    } catch (error) {
      toast.error(error.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordStatus('');
    try {
      await changePassword(passwordForm.current, passwordForm.next);
      setPasswordStatus('Password updated successfully.');
      setPasswordForm({ current: '', next: '' });
    } catch (error) {
      setPasswordStatus(error.message || 'Could not change your password.');
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-5xl mx-auto animate-fadeUp">
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="flex flex-col gap-5">
          <Card padded={false} className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary via-primary-600 to-ink-800 p-7 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-3">
                {avatarLetter}
              </div>
              <h2 className="text-white font-display font-bold text-lg">{name}</h2>
              <p className="text-white/70 text-sm mt-0.5">{profile?.program ?? 'Program pending'} {profile?.year_level ? `- Year ${profile.year_level}` : ''}</p>
              <p className="text-white/50 text-xs mt-1">{user?.student_number ? `ID: ${user.student_number}` : 'Student number pending'}</p>
              <div className="flex justify-center gap-6 mt-5 pt-4 border-t border-white/15">
                <MiniStat val={profile?.xp_points ?? 0} label="XP" />
                <MiniStat val={profile?.level ?? 0} label="Level" />
                <MiniStat val={data?.activities?.length ?? 0} label="Activities" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Account info"
              action={
                <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={handleEditToggle} disabled={saving}>
                  {editing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
                </Button>
              }
            />
            <div className="flex flex-col gap-3 text-sm">
              <InfoRow label="Email" value={user?.email} />
              <InfoRow
                label="Program"
                editing={editing}
                value={form.program}
                onChange={(value) => setForm((current) => ({ ...current, program: value }))}
              />
              <InfoRow
                label="Bio"
                editing={editing}
                value={form.bio}
                onChange={(value) => setForm((current) => ({ ...current, bio: value }))}
              />
              <InfoRow
                label="Year level"
                editing={editing}
                type="number"
                value={form.year_level}
                onChange={(value) => setForm((current) => ({ ...current, year_level: value }))}
                displayValue={profile?.year_level ? `Year ${profile.year_level}` : null}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Change password" />
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2.5">
              <input
                type="password"
                required
                placeholder="Current password"
                value={passwordForm.current}
                onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))}
                className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (min. 8 characters)"
                value={passwordForm.next}
                onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))}
                className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none"
              />
              {passwordStatus && <p className="text-xs text-ink-500">{passwordStatus}</p>}
              <Button type="submit" size="sm" variant="outline">Update password</Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-5">
          <Card>
            <CardHeader title="Activity history" />
            {data?.activities?.length ? (
              <div className="flex flex-col gap-3.5">
                {data.activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-ink-50 flex items-center justify-center text-sm flex-shrink-0">{activity.activity_type?.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <p className="text-sm text-ink-800 leading-snug">{activity.description}</p>
                      <span className="text-xs text-ink-400">{new Date(activity.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No activity yet" message="Your learning activity will show up here as you use AILA." />}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ val, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-white font-bold text-base">{val}</span>
      <span className="text-white/50 text-[0.65rem]">{label}</span>
    </div>
  );
}

function InfoRow({ label, value, editing, onChange, type = 'text', displayValue }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-ink-50 last:border-0">
      <span className="text-ink-400 font-medium">{label}</span>
      {editing && onChange ? (
        <input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="text-right border border-primary-200 rounded-lg px-2 py-1 text-sm outline-none w-40"
        />
      ) : (
        <span className="text-ink-800 font-medium text-right">{(displayValue ?? value) || 'Pending'}</span>
      )}
    </div>
  );
}
