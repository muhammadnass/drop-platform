'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  TrendingUp, Package, Users, Bike,
  DollarSign, LogOut, ChevronRight, BarChart2,
} from 'lucide-react';

export default function ManagerDashboard() {
  const { user, logout, isHydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !user) router.replace('/auth/login');
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) {
    return (
      <div className="min-h-screen bg-[#1A1208] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-8">
      <header className="border-b border-white/10 px-6 pb-4 flex items-center justify-between" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden">
            <img src="/icons/logo.png" alt="Drop" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Drop</span>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">Manager</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/40 text-sm hidden sm:block">{user.email}</span>
          <button onClick={async () => { await logout(); router.replace('/auth/login'); }}
            className="text-white/40 hover:text-white transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>
            Operations Overview
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            Monitor revenue, deliveries and fleet activity.
          </p>
        </div>

        {/* Revenue banner */}
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
            <TrendingUp size={16} /> Revenue This Month
          </div>
          <div className="text-3xl font-bold text-white">₦0</div>
          <div className="text-white/40 text-sm mt-1">Platform fee (8% of all deliveries)</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Deliveries', value: '—', icon: Package,    color: '#E8420A' },
            { label: 'Active Riders',    value: '—', icon: Bike,       color: '#22C55E' },
            { label: 'Customers',        value: '—', icon: Users,      color: '#3B82F6' },
            { label: 'Businesses',       value: '—', icon: DollarSign, color: '#A855F7' },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/50 text-xs">{s.label}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}20` }}>
                  <s.icon size={14} style={{ color: s.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white/30">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Manager actions — read-only, no platform config */}
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Reports</h2>
        <div className="space-y-2">
          {[
            { label: 'Delivery Reports',    desc: 'Completed, cancelled, failed',  icon: Package,    color: '#E8420A' },
            { label: 'Revenue Breakdown',   desc: 'Daily / weekly / monthly',      icon: BarChart2,  color: '#22C55E' },
            { label: 'Rider Performance',   desc: 'Ratings, trips, earnings',      icon: Bike,       color: '#A855F7' },
            { label: 'Business Accounts',   desc: 'View subscriptions (read-only)', icon: Users,     color: '#3B82F6' },
          ].map((a) => (
            <button
              key={a.label}
              className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-4 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${a.color}20` }}>
                  <a.icon size={18} style={{ color: a.color }} />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">{a.label}</div>
                  <div className="text-white/40 text-xs">{a.desc}</div>
                </div>
              </div>
              <ChevronRight size={15} className="text-white/30" />
            </button>
          ))}
        </div>

        <p className="text-white/20 text-xs text-center pt-2">
          Manager access — platform settings require Super Admin
        </p>
      </div>
    </div>
  );
}
