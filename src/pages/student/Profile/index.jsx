import { useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import Switch from '../../../components/common/Switch';
import { useToast } from '../../../components/common/Toast';
import { useProfileData } from '../../../hooks/useProfileData';
import { changePassword, updateProfile } from '../../../services/api/profileService';
import ActivityList from '../../../components/student/ActivityList';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export default function ProfilePage() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data } = useProfileData(refreshVersion);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ program: '', year_level: '', bio: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [showPassword, setShowPassword] = useState({ current: false, next: false, confirm: false });
  const [changingPassword, setChangingPassword] = useState(false);
  const [leaderboardSaving, setLeaderboardSaving] = useState(false);
  const toast = useToast();

  const passwordsMatch = passwordForm.next.length > 0 && passwordForm.next === passwordForm.confirm;
  const passwordFormValid =
    passwordForm.current.length > 0 &&
    passwordForm.next.length >= PASSWORD_MIN &&
    passwordForm.next.length <= PASSWORD_MAX &&
    passwordsMatch;

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

  const handleLeaderboardToggle = async (next) => {
    if (!profile) return;
    setLeaderboardSaving(true);
    try {
      await updateProfile({ leaderboard_opt_in: next });
      setRefreshVersion((version) => version + 1);
      toast.success(next ? "You'll now appear on the leaderboard." : "You've been removed from the leaderboard.");
    } catch (error) {
      toast.error(error.message || 'Could not update that setting.');
    } finally {
      setLeaderboardSaving(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!passwordFormValid) return;
    setChangingPassword(true);
    try {
      await changePassword(passwordForm.current, passwordForm.next);
      setPasswordForm({ current: '', next: '', confirm: '' });
      toast.success('Password updated successfully.');
    } catch (error) {
      toast.error(error.message || 'Could not change your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-6xl 2xl:max-w-7xl mx-auto animate-fadeUp">
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
                long
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
            <CardHeader title="Leaderboard" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-800">Show me on the leaderboard</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  When on, other students see your first name, last initial, level, and XP. Your email, program, year,
                  and scores are never shown.
                </p>
              </div>
              <Switch
                checked={Boolean(profile?.leaderboard_opt_in)}
                onChange={handleLeaderboardToggle}
                disabled={leaderboardSaving || !profile}
                ariaLabel="Show me on the leaderboard"
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Change password" />
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
              <PasswordField
                label="Current password"
                value={passwordForm.current}
                onChange={(value) => setPasswordForm((current) => ({ ...current, current: value }))}
                show={showPassword.current}
                onToggleShow={() => setShowPassword((current) => ({ ...current, current: !current.current }))}
              />
              <PasswordField
                label="New password"
                value={passwordForm.next}
                onChange={(value) => setPasswordForm((current) => ({ ...current, next: value }))}
                show={showPassword.next}
                onToggleShow={() => setShowPassword((current) => ({ ...current, next: !current.next }))}
                hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters.`}
              />
              <PasswordField
                label="Confirm new password"
                value={passwordForm.confirm}
                onChange={(value) => setPasswordForm((current) => ({ ...current, confirm: value }))}
                show={showPassword.confirm}
                onToggleShow={() => setShowPassword((current) => ({ ...current, confirm: !current.confirm }))}
                error={passwordForm.confirm.length > 0 && !passwordsMatch ? 'Passwords do not match.' : null}
              />
              <Button type="submit" size="sm" variant="outline" disabled={!passwordFormValid || changingPassword}>
                {changingPassword ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-5">
          <Card>
            <CardHeader title="Activity history" />
            {data?.activities?.length ? (
              <ActivityList activities={data.activities} />
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

function InfoRow({ label, value, editing, onChange, type = 'text', displayValue, long = false }) {
  if (long) {
    return (
      <div className="flex flex-col gap-1 py-1.5 border-b border-ink-50 last:border-0">
        <span className="text-ink-400 font-medium">{label}</span>
        {editing && onChange ? (
          <textarea
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            className="w-full border border-primary-200 rounded-lg px-2.5 py-1.5 text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-primary-200"
          />
        ) : (
          <span className="text-ink-800 font-medium text-left whitespace-pre-wrap break-words">{(displayValue ?? value) || 'Pending'}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-ink-50 last:border-0">
      <span className="text-ink-400 font-medium">{label}</span>
      {editing && onChange ? (
        <input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="text-right border border-primary-200 rounded-lg px-2 py-1 text-sm outline-none w-40 focus-visible:ring-2 focus-visible:ring-primary-200"
        />
      ) : (
        <span className="text-ink-800 font-medium text-right">{(displayValue ?? value) || 'Pending'}</span>
      )}
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggleShow, hint, error }) {
  return (
    <div>
      <label className="text-xs font-semibold text-ink-700 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border border-ink-100 focus:border-primary-300 rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-primary"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
