'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import {
  Users, Package, DollarSign, Bike, LogOut,
  ChevronRight, TrendingUp, Settings, Building2,
  AlertCircle, Activity,
} from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalRiders: number;
  activeRiders: number;
  pendingDeliveries: number;
  activeDeliveries: number;
  monthlyDeliveries: number;
  monthlyRevenueNgn: number;
  totalBusinesses: number;
}

function fmt(n: number) {
  return n >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `₦${(n / 1_000).toFixed(0)}k`
    : `₦${n.toLocaleString()}`;
}

export default function AdminDashboard() {
  const { user, token, logout, isHydrated } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isHydrated && !user) router.replace('/auth/login');
  }, [isHydrated, user, router]);

  useEffect(() => {
    if (!token) return;
    api.adminStats(token)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (!isHydrated || !user) return <Loader />;

  const cards = [
    { label: 'Total Users',        value: stats?.totalUsers ?? '—',        icon: Users,    color: '#E8420A' },
    { label: 'Active Deliveries',  value: stats?.activeDeliveries ?? '—',  icon: Activity, color: '#22C55E' },
    { label: 'Revenue This Month', value: stats ? fmt(stats.monthlyRevenueNgn) : '—', icon: DollarSign, color: '#A855F7' },
    { label: 'Active Riders',      value: stats?.activeRiders ?? '—',      icon: Bike,     color: '#3B82F6' },
  ];

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DropLogo />
          <span className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Drop</span>
          <span className="text-xs bg-[#E8420A]/20 text-[#E8420A] px-2 py-0.5 rounded-full">Super Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm hidden sm:block">{user.email}</span>
          <button onClick={async () => { await logout(); router.replace('/auth/login'); }}
            className="text-white/40 hover:text-white transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Platform Overview</h1>
          <p className="text-white/40 text-sm mt-0.5">Live metrics across all operations.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/50 text-xs">{c.label}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}20` }}>
                  <c.icon size={14} style={{ color: c.color }} />
                </div>
              </div>
              {loading ? (
                <div className="h-7 w-16 bg-white/10 rounded animate-pulse" />
              ) : (
                <div className="text-2xl font-bold">{c.value}</div>
              )}
            </div>
          ))}
        </div>

        {/* Secondary stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Pending Orders',    value: stats.pendingDeliveries },
              { label: 'Month Deliveries',  value: stats.monthlyDeliveries },
              { label: 'Total Riders',      value: stats.totalRiders },
              { label: 'Businesses',        value: stats.totalBusinesses },
            ].map((s) => (
              <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="text-white/40 text-xs">{s.label}</div>
                <div className="text-lg font-bold mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider pt-2">Management</h2>
        <div className="space-y-2">
          {[
            { label: 'User Management',    desc: 'View, edit roles, deactivate accounts', icon: Users,     color: '#E8420A', href: '/dashboard/admin/users' },
            { label: 'All Deliveries',     desc: 'Live and historical order feed',        icon: Package,   color: '#22C55E', href: '/dashboard/admin/deliveries' },
            { label: 'Revenue & Analytics', desc: '6-month breakdown, GMV, fees',         icon: TrendingUp, color: '#A855F7', href: '/dashboard/admin/revenue' },
            { label: 'Business Accounts',  desc: 'Subscriptions, rider fleets',           icon: Building2, color: '#3B82F6', href: '/dashboard/admin/businesses' },
            { label: 'Platform Settings',  desc: 'Fare, commission, timeouts',            icon: Settings,  color: '#F59E0B', href: '/dashboard/admin/settings' },
          ].map((a) => (
            <Link key={a.label} href={a.href}
              className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${a.color}20` }}>
                  <a.icon size={18} style={{ color: a.color }} />
                </div>
                <div>
                  <div className="font-semibold text-sm">{a.label}</div>
                  <div className="text-white/40 text-xs">{a.desc}</div>
                </div>
              </div>
              <ChevronRight size={15} className="text-white/30" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="min-h-screen bg-[#1A1208] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function DropLogo() {
  return (
    <div className="w-8 h-8 rounded-lg overflow-hidden">
      <img src="/icons/logo.png" alt="Drop" className="w-full h-full object-cover" />
    </div>
  );
}
