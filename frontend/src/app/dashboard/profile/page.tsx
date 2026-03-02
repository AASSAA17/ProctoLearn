'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';

interface ProfileForm {
  name: string;
  phone: string;
}

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const [form, setForm] = useState<ProfileForm>({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', phone: (user as any).phone || '' });
    }
    api.get('/users/me').then(({ data }) => {
      setProfileData(data);
      setForm({ name: data.name || '', phone: data.phone || '' });
    }).catch(() => {});
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/users/me/profile', form);
      await fetchMe();
      toast.success('Профиль жаңартылды');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Кате орын алды');
    } finally {
      setSaving(false);
    }
  };

  const info = profileData || user;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Менің профилім</h1>

      {/* Info card */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-700">
            {info?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{info?.name}</p>
            <p className="text-sm text-gray-500">{info?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">
              {info?.role}
            </span>
          </div>
        </div>

        {info?.lastSeen && (
          <div className="text-xs text-gray-400 mb-2">
            Соңғы белсенділік: {new Date(info.lastSeen).toLocaleString('kk-KZ')}
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Ақпаратты өзгерту</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Аты-жөні</label>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input
              type="tel"
              className="input"
              placeholder="+7 (___) ___-__-__"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Электронды пошта</label>
            <input
              type="email"
              className="input bg-gray-50 cursor-not-allowed"
              value={info?.email || ''}
              disabled
            />
            <p className="text-xs text-gray-400 mt-1">Поштаны өзгерту мүмкін емес</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? 'Сақталуда...' : 'Сақтау'}
          </button>
        </div>
      </div>
    </div>
  );
}
