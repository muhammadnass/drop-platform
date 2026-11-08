'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import {
  ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight,
  UserCheck, UserX, Edit2, Shield, Bike, Building2, User, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:    '#E8420A',
  MANAGER:        '#3B82F6',
  BUSINESS_OWNER: '#A855F7',
  RIDER:          '#22C55E',
  CUSTOMER:       '#EAB308',
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  SUPER_ADMIN:    Shield,
  MANAGER:        Users,
  BUSINESS_OWNER: Building2,
  RIDER:          Bike,
  CUSTOMER:       User,
};

interface UserRow {
  id: string; name: string; email: string; phone?: string;
  role: string; isActive: boolean; createdAt: string;
}

interface EditModal {
  user: UserRow;
  role: string;
  active: boolean;
}

function AdminUsersPageInner() {
  const { user: me, token, isHydrated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [roleFilter, setRole]   = useState(() => searchParams.get('role') ?? '');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [perPage]               = useState(20);
  const [edit, setEdit]         = useState<EditModal | null>(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (isHydrated && !me) router.replace('/auth/login');
  }, [isHydrated, me, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(perPage) });
      if (search)     params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const res = await api.adminUsers(params.toString(), token);
      setUsers(res.data?.users ?? res.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }, [token, page, search, roleFilter, perPage]);

  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    if (!edit || !token) return;
    setSaving(true);
    try {
      await api.updateUser(edit.user.id, { role: edit.role, isActive: edit.active }, token);
      toast.success('User updated');
      setEdit(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!isHydrated || !me) return <Spin />;

  const pages = Math.ceil(total / perPage);

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/admin')} className="text-white/40 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <div className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>User Management</div>
          <div className="text-white/40 text-xs">{total} total users</div>
        </div>
        <button onClick={load} className="text-white/40 hover:text-white transition-colors"><RefreshCw size={16} /></button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-[#E8420A] transition-colors"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-sm outline-none focus:border-[#E8420A] appearance-none"
          >
            <option value="">All roles</option>
            {['SUPER_ADMIN','MANAGER','BUSINESS_OWNER','RIDER','CUSTOMER'].map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-white/30">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {['User', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => {
                    const RIcon = ROLE_ICONS[u.role] ?? User;
                    return (
                      <tr key={u.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{u.name}</div>
                          <div className="text-white/40 text-xs">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: `${ROLE_COLORS[u.role] ?? '#888'}20`, color: ROLE_COLORS[u.role] ?? '#888' }}>
                            <RIcon size={10} /> {u.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {new Date(u.createdAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEdit({ user: u, role: u.role, active: u.isActive })}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-30 hover:border-white/20 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-30 hover:border-white/20 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {edit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#221810] border border-white/10 rounded-3xl p-6">
            <h3 className="font-bold text-lg mb-1">Edit User</h3>
            <p className="text-white/40 text-sm mb-5">{edit.user.name} · {edit.user.email}</p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-white/60 text-xs font-semibold">Role</label>
                <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm outline-none focus:border-[#E8420A] appearance-none">
                  {['SUPER_ADMIN','MANAGER','BUSINESS_OWNER','RIDER','CUSTOMER'].map((r) => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-sm font-medium">Account Active</span>
                <button
                  onClick={() => setEdit({ ...edit, active: !edit.active })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${edit.active ? 'bg-green-500' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${edit.active ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEdit(null)} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-grow py-3 rounded-xl bg-[#E8420A] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}

import { Suspense } from 'react';
export default function AdminUsersPage() {
  return <Suspense fallback={<Spin />}><AdminUsersPageInner /></Suspense>;
}
