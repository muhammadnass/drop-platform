'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

function Spinner() { return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />; }

export default function CustomerSettingsPage() {
  const router = useRouter();
  const { user, deleteAccount, logout } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setBusy(true); setError('');
    const res = await deleteAccount();
    setBusy(false);
    if (res.ok) { router.replace('/auth/login'); return; }
    setError(res.error ?? 'Failed to delete account');
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-16">
      <div className="bg-[#1a1a1a] px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-white/60 hover:text-white text-xl">←</button>
        <div className="flex-1">
          <p className="text-white font-bold">Settings</p>
          <p className="text-white/40 text-xs">{user?.name}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
        <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-3">
          <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">Account</p>
          <div className="space-y-1">
            <p className="text-white/40 text-xs">Name</p>
            <p className="text-white text-sm">{user?.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-white/40 text-xs">Email</p>
            <p className="text-white text-sm">{user?.email}</p>
          </div>
          <button onClick={async () => { await logout(); router.replace('/auth/login'); }}
            className="w-full border border-white/20 text-white/70 font-semibold py-3 rounded-xl hover:bg-white/5 transition-all mt-2">
            Log out
          </button>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-3">
          <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">Danger Zone</p>
          <p className="text-white/40 text-xs">Deleting your account removes your personal data permanently. If you have delivery history, your account will be deactivated and your email/phone freed up, but past deliveries are kept for record-keeping.</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="w-full border border-red-500/40 text-red-400 font-semibold py-3 rounded-xl hover:bg-red-500/10 transition-all">
              Delete my account
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-red-400 text-sm font-medium">Are you sure? This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
                <button onClick={handleDelete} disabled={busy}
                  className="flex-grow py-3 rounded-xl bg-red-500 text-white font-bold disabled:opacity-40">
                  {busy ? <Spinner /> : 'Yes, delete my account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
