'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, TrendingUp, DollarSign, Package, Percent } from 'lucide-react';

interface MonthData {
  month: string;
  revenueNgn: number;
  gmvNgn: number;
  deliveries: number;
  commissionNgn: number;
}

function bar(val: number, max: number) {
  return Math.max(4, Math.round((val / Math.max(max, 1)) * 100));
}

export default function AdminRevenuePage() {
  const { user, token, isHydrated } = useAuth();
  const router = useRouter();
  const [data, setData]     = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);

  useEffect(() => {
    if (!token) return;
    api.adminRevenue(token)
      .then((d) => setData(Array.isArray(d) ? d : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (!isHydrated || !user) return <Spin />;

  const maxRev = Math.max(...data.map((d) => d.revenueNgn), 1);
  const maxDel = Math.max(...data.map((d) => d.deliveries), 1);
  const totalRev = data.reduce((s, d) => s + d.revenueNgn, 0);
  const totalGMV = data.reduce((s, d) => s + d.gmvNgn, 0);
  const totalDel = data.reduce((s, d) => s + d.deliveries, 0);
  const avgTake  = totalGMV > 0 ? ((totalRev / totalGMV) * 100).toFixed(1) : '0';

  function fmt(n: number) {
    return n >= 1_000_000 ? `₦${(n/1_000_000).toFixed(2)}M` : `₦${(n/1_000).toFixed(0)}k`;
  }

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/admin')} className="text-white/40 hover:text-white"><ArrowLeft size={20} /></button>
        <div>
          <div className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Revenue & Analytics</div>
          <div className="text-white/40 text-xs">Last 6 months</div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue',   value: fmt(totalRev), icon: DollarSign, color: '#E8420A' },
            { label: 'Total GMV',       value: fmt(totalGMV), icon: TrendingUp, color: '#A855F7' },
            { label: 'Total Deliveries', value: String(totalDel), icon: Package, color: '#22C55E' },
            { label: 'Avg Take Rate',   value: `${avgTake}%`,    icon: Percent,  color: '#3B82F6' },
          ].map((c) => (
            <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/50 text-xs">{c.label}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}20` }}>
                  <c.icon size={13} style={{ color: c.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold">{loading ? <div className="h-7 w-16 bg-white/10 rounded animate-pulse" /> : c.value}</div>
            </div>
          ))}
        </div>

        {/* Revenue bar chart */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="font-semibold mb-5">Monthly Revenue (₦)</h3>
          {loading ? (
            <div className="h-40 flex items-end gap-3">
              {[60,80,45,90,70,55].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-lg bg-white/10 animate-pulse" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-white/20 text-sm">No data yet</div>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {data.map((d) => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-lg bg-[#E8420A]/70 hover:bg-[#E8420A] transition-colors cursor-default relative group"
                    style={{ height: `${bar(d.revenueNgn, maxRev)}%` }}>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#1A1208] border border-white/10 rounded-lg px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {fmt(d.revenueNgn)}
                    </div>
                  </div>
                  <div className="text-white/40 text-xs">{d.month}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deliveries bar chart */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="font-semibold mb-5">Monthly Deliveries</h3>
          {loading ? (
            <div className="h-36 flex items-end gap-3">
              {[40,70,55,85,60,45].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-lg bg-white/10 animate-pulse" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-white/20 text-sm">No data yet</div>
          ) : (
            <div className="flex items-end gap-2 h-36">
              {data.map((d) => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-lg bg-purple-500/60 hover:bg-purple-500/80 transition-colors cursor-default relative group"
                    style={{ height: `${bar(d.deliveries, maxDel)}%` }}>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#1A1208] border border-white/10 rounded-lg px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {d.deliveries}
                    </div>
                  </div>
                  <div className="text-white/40 text-xs">{d.month}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {!loading && data.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Month', 'Revenue', 'GMV', 'Deliveries', 'Commission'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.map((d) => (
                  <tr key={d.month} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium">{d.month}</td>
                    <td className="px-4 py-3 text-[#E8420A] font-semibold">{fmt(d.revenueNgn)}</td>
                    <td className="px-4 py-3 text-white/60">{fmt(d.gmvNgn)}</td>
                    <td className="px-4 py-3">{d.deliveries}</td>
                    <td className="px-4 py-3 text-white/60">{fmt(d.commissionNgn ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}
