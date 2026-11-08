'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

const INDUSTRIES = [
  'Restaurant / Food & Beverage',
  'E-commerce / Retail',
  'Pharmacy / Healthcare',
  'Grocery / Supermarket',
  'Fashion & Apparel',
  'Electronics',
  'Logistics & Courier',
  'Agriculture / Fresh Produce',
  'Other',
];

export default function CompanyProfilePage() {
  const { user, token } = useAuth();
  const router   = useRouter();

  const [form, setForm] = useState({
    businessName:  '',
    address:       '',
    website:       '',
    industry:      '',
    description:   '',
    primaryColor:  '#E8420A',
    welcomeMsg:    '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (!token) return;
    api.businessProfile(token)
      .then((biz: any) => setForm({
        businessName: biz.name ?? '',
        address:      biz.address ?? '',
        website:      biz.website ?? '',
        industry:     biz.industry ?? '',
        description:  biz.description ?? '',
        primaryColor: biz.customBranding?.primaryColor ?? '#E8420A',
        welcomeMsg:   biz.customBranding?.welcomeMessage ?? '',
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await api.updateBusinessProfile({
        name:        form.businessName || undefined,
        address:     form.address || undefined,
        website:     form.website || undefined,
        industry:    form.industry || undefined,
        description: form.description || undefined,
        customBranding: { primaryColor: form.primaryColor, welcomeMessage: form.welcomeMsg },
      }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-white/50 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg" style={{ fontFamily: 'var(--font-syne)' }}>Company Profile</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-6">
        <p className="text-white/40 text-sm mb-6">
          Customise how your business appears on Drop. Your branding and workflow details help us tailor the platform for your team.
        </p>

        <form onSubmit={handleSave} className="space-y-5">

          {/* Business Info */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Business Information</h2>

            {[
              { label: 'Business Name',    key: 'businessName', placeholder: 'e.g. Kano Fresh Groceries' },
              { label: 'Address',          key: 'address',      placeholder: 'Business address' },
              { label: 'Website',          key: 'website',      placeholder: 'https://yourbusiness.com (optional)' },
            ].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-white/60 text-xs font-medium">{f.label}</label>
                <input
                  value={(form as any)[f.key]}
                  onChange={set(f.key)}
                  placeholder={f.placeholder}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="text-white/60 text-xs font-medium">Industry</label>
              <select
                value={form.industry}
                onChange={set('industry')}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm outline-none focus:border-[#E8420A] transition-colors appearance-none"
              >
                <option value="" disabled>Select your industry</option>
                {INDUSTRIES.map((i) => <option key={i} value={i} className="bg-[#1A1208]">{i}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-white/60 text-xs font-medium">Business Description</label>
              <textarea
                value={form.description}
                onChange={set('description')}
                placeholder="Briefly describe what your business does…"
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] resize-none"
              />
            </div>
          </section>

          {/* Branding */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Custom Branding</h2>

            <div className="space-y-1.5">
              <label className="text-white/60 text-xs font-medium">Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={set('primaryColor')}
                  className="w-12 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer"
                />
                <div>
                  <div className="font-mono text-sm text-white">{form.primaryColor}</div>
                  <div className="text-white/30 text-xs">Used on your rider app interface</div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-white/60 text-xs font-medium">Welcome Message to Riders</label>
              <textarea
                value={form.welcomeMsg}
                onChange={set('welcomeMsg')}
                placeholder="e.g. Welcome to Kano Fresh delivery team! Always be courteous…"
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] resize-none"
              />
            </div>
          </section>

          {/* Subscription note */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm">
            <div className="font-semibold mb-1">Billing Summary</div>
            <div className="text-white/50 space-y-1">
              <div className="flex justify-between"><span>Monthly subscription</span><span className="text-white">$20.00 / mo</span></div>
              <div className="flex justify-between"><span>Commission per delivery</span><span className="text-white">8%</span></div>
              <div className="flex justify-between"><span>Your riders</span><span className="text-white">Unlimited</span></div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={saving || loading}
            className="w-full py-3.5 rounded-xl bg-[#E8420A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
            style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}
          >
            {saved ? <><CheckCircle2 size={18} /> Saved!</> : saving ? 'Saving…' : 'Save Company Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
