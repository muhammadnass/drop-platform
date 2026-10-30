'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, Search, Building2, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';

export default function AdminBusinessesPage() {
  const { user, token, isHydrated } = useAuth();
  const router = useRouter();

  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const PER_PAGE = 20;

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const businesses = await api.adminBusinesses(token);
      const list = Array.isArray(businesses) ? businesses : [];
      const filtered = search ? list.filter((b: any) =>
        (b.businessName ?? b.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (b.owner?.email ?? b.email ?? '').toLowerCase().includes(search.toLowerCase())
      ) : list;
      setTotal(filtered.length);
      const start = (page - 1) * PER_PAGE;
      setBusinesses(filtered.slice(start, start + PER_PAGE));
    } catch { } finally { setLoading(false); }
  }, [token, page, search]);

  useEffect(() => { load(); }, [load]);

  if (!isHydrated || !user) return <Spin />;

  const pages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/admin')} className="text-white/40 hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <div className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Business Accounts</div>
          <div className="text-white/40 text-xs">{total} registered businesses</div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by business name or owner email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-[#E8420A] transition-colors" />
        </div>

        {loading ? (
          <div className="grid gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
                <div className="h-4 w-48 bg-white/10 rounded mb-2" />
                <div className="h-3 w-32 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-16 text-white/20">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            No businesses found
          </div>
        ) : (
          <div className="grid gap-3">
            {businesses.map((b: any) => {
              const isActive = b.subscription?.status === 'ACTIVE';
              return (
                <div key={b.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.08] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#E8420A]/20 flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-[#E8420A]" />
                      </div>
                      <div>
                        <div className="font-semibold">{b.businessName ?? b.name ?? '—'}</div>
                        <div className="text-white/40 text-xs mt-0.5">{b.owner?.email ?? b.email ?? '—'}</div>
                        {b.owner?.name && <div className="text-white/30 text-xs">{b.owner.name}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isActive ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                        {isActive ? 'Subscribed' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-white/40">
                    <span>{b._count?.riders ?? b.riderCount ?? 0} riders</span>
                    <span>{b._count?.deliveries ?? b.deliveryCount ?? 0} deliveries</span>
                    {b.createdAt && <span>Joined {new Date(b.createdAt).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="p-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-30"><ChevronLeft size={15} /></button>
              <button disabled={page>=pages} onClick={() => setPage(p=>p+1)} className="p-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}
