// ============================================================
// DROP LOGISTICS — Paystack Service
// ============================================================

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE = 'https://api.paystack.co';

interface PaystackHeaders {
  Authorization: string;
  'Content-Type': string;
  [key: string]: string;
}

function headers(): PaystackHeaders {
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json',
  };
}

// ── Initialize a transaction ──────────────────────────────────
export async function paystackInitialize(params: {
  email: string;
  amountKobo: number;          // amount in kobo (1 NGN = 100 kobo)
  reference?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
  plan?: string;               // plan code for subscription
}) {
  const body: Record<string, unknown> = {
    email:        params.email,
    amount:       params.amountKobo,
    callback_url: params.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
    metadata:     params.metadata ?? {},
    channels:     params.channels ?? ['card', 'bank', 'ussd', 'bank_transfer'],
  };
  if (params.reference) body.reference = params.reference;
  if (params.plan)      body.plan = params.plan;

  const res = await fetch(`${BASE}/transaction/initialize`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!json.status) throw new Error(json.message ?? 'Paystack initialize failed');
  return json.data as { authorization_url: string; access_code: string; reference: string };
}

// ── Verify a transaction ──────────────────────────────────────
export async function paystackVerify(reference: string) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: headers(),
  });
  const json = await res.json() as any;
  if (!json.status) throw new Error(json.message ?? 'Paystack verify failed');
  return json.data as {
    status: string;          // 'success' | 'failed' | 'abandoned'
    amount: number;          // in kobo
    reference: string;
    customer: { email: string; customer_code: string };
    authorization?: { authorization_code: string; reusable: boolean };
    metadata: Record<string, unknown>;
  };
}

// ── Create a subscription plan (idempotent) ───────────────────
export async function paystackCreatePlan(params: {
  name: string;
  amountKobo: number;
  interval: 'monthly' | 'annually';
  description?: string;
}) {
  // Check if plan already exists
  const listRes = await fetch(`${BASE}/plan?perPage=50`, { headers: headers() });
  const listJson = await listRes.json() as any;
  if (listJson.status) {
    const existing = listJson.data.find((p: any) => p.name === params.name);
    if (existing) return existing as { plan_code: string; name: string };
  }

  const res = await fetch(`${BASE}/plan`, {
    method:  'POST',
    headers: headers(),
    body: JSON.stringify({
      name:        params.name,
      amount:      params.amountKobo,
      interval:    params.interval,
      description: params.description,
    }),
  });
  const json = await res.json() as any;
  if (!json.status) throw new Error(json.message ?? 'Paystack create plan failed');
  return json.data as { plan_code: string; name: string };
}

// ── Validate webhook signature ────────────────────────────────
import crypto from 'crypto';

export function validateWebhookSignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(body)
    .digest('hex');
  return hash === signature;
}

// ── USD to NGN (static rate, can be dynamic later) ───────────
export function usdToNgn(usd: number): number {
  const rate = parseFloat(process.env.USD_NGN_RATE ?? '1600');
  return Math.round(usd * rate * 100); // returns kobo
}
