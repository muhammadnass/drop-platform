// ============================================================
// DROP LOGISTICS — API Client
// ============================================================

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';

async function request<T>(path: string, opts: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  if (token) (headers as any)['Authorization'] = `Bearer ${token}`;

  const res  = await fetch(`${BASE}${path}`, { ...opts, headers });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

function withData<T>(path: string, opts?: RequestInit, token?: string | null) {
  return request<{ success: true; data: T }>(path, opts, token).then((r) => r.data);
}

export const api = {
  // ── Fare ──────────────────────────────────────────────────
  fareConfig: (token?: string) =>
    withData<any>('/api/fare/config', {}, token),

  fareCalculate: (distanceKm: number, vehicleTier: string, token?: string) =>
    withData<any>('/api/fare/calculate', {
      method: 'POST',
      body: JSON.stringify({ distanceKm, vehicleTier }),
    }, token),

  cancellationReasons: (role: 'RIDER' | 'CUSTOMER', token?: string) =>
    withData<any[]>(`/api/fare/cancellation-reasons/${role}`, {}, token),

  // ── Uploads ───────────────────────────────────────────────
  uploadImage: (base64: string, folder: 'profiles' | 'plates' | 'items', token: string) =>
    withData<{ url: string }>('/api/uploads/image', {
      method: 'POST',
      body: JSON.stringify({ base64, folder }),
    }, token),

  uploadVoiceNote: (base64: string, deliveryId: string, token: string) =>
    withData<{ url: string; durationSecs: number }>('/api/uploads/voice-note', {
      method: 'POST',
      body: JSON.stringify({ base64, deliveryId }),
    }, token),

  // ── Rider ─────────────────────────────────────────────────
  riderProfile: (token: string) =>
    withData<any>('/api/riders/profile', {}, token),

  updateRiderProfile: (data: any, token: string) =>
    withData<any>('/api/riders/profile', { method: 'PATCH', body: JSON.stringify(data) }, token),

  riderStatus: (isOnline: boolean, lat?: number, lng?: number, token?: string) =>
    withData<any>('/api/riders/status', { method: 'PATCH', body: JSON.stringify({ isOnline, lat, lng }) }, token),

  riderKyc: (kycType: 'NIN' | 'BVN', kycValue: string, token: string) =>
    withData<any>('/api/riders/kyc', { method: 'POST', body: JSON.stringify({ kycType, kycValue }) }, token),

  availableOrders: (token: string) =>
    withData<any[]>('/api/riders/orders/available', {}, token),

  activeOrder: (token: string) =>
    withData<any>('/api/riders/orders/active', {}, token),

  orderHistory: (page = 1, token?: string) =>
    request<any>(`/api/riders/orders/history?page=${page}`, {}, token),

  acceptOrder: (id: string, token: string) =>
    withData<any>(`/api/riders/orders/${id}/accept`, { method: 'POST' }, token),

  declineOrder: (id: string, token: string) =>
    withData<any>(`/api/riders/orders/${id}/decline`, { method: 'POST' }, token),

  arrivedPickup: (id: string, token: string) =>
    withData<any>(`/api/riders/orders/${id}/arrived`, { method: 'POST' }, token),

  pickupOrder: (id: string, token: string) =>
    withData<any>(`/api/riders/orders/${id}/pickup`, { method: 'POST' }, token),

  completeOrder: (id: string, token: string) =>
    withData<any>(`/api/riders/orders/${id}/complete`, { method: 'POST' }, token),

  cancelOrder: (id: string, body: any, token: string) =>
    withData<any>(`/api/riders/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) }, token),

  riderWallet: (token: string) =>
    withData<any>('/api/riders/wallet', {}, token),

  riderWalletTopup: (amountNgn: number, token: string) =>
    withData<{ authorizationUrl: string; reference: string }>('/api/riders/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amountNgn }),
    }, token),

  riderWalletTopupVerify: (reference: string, token: string) =>
    withData<any>(`/api/riders/wallet/topup/verify?reference=${reference}`, {}, token),

  riderStats: (token: string) =>
    withData<any>('/api/riders/stats', {}, token),

  updateLocation: (lat: number, lng: number, deliveryId: string | undefined, token: string) =>
    withData<any>('/api/riders/location', { method: 'POST', body: JSON.stringify({ lat, lng, deliveryId }) }, token),

  // ── Customer ──────────────────────────────────────────────
  customerWallet: (token: string) =>
    withData<any>('/api/customers/wallet', {}, token),

  customerWalletTopup: (amountNgn: number, token: string) =>
    withData<{ authorizationUrl: string; reference: string }>('/api/customers/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amountNgn }),
    }, token),

  customerWalletTopupVerify: (reference: string, token: string) =>
    withData<any>(`/api/customers/wallet/topup/verify?reference=${reference}`, {}, token),

  customerProfile: (token: string) =>
    withData<any>('/api/customers/profile', {}, token),

  // ── Deliveries ────────────────────────────────────────────
  createDelivery: (data: any, token: string) =>
    withData<any>('/api/deliveries', { method: 'POST', body: JSON.stringify(data) }, token),

  deliveries: (page = 1, token?: string) =>
    request<any>(`/api/deliveries?page=${page}`, {}, token),

  delivery: (id: string, token: string) =>
    withData<any>(`/api/deliveries/${id}`, {}, token),

  activeDelivery: (token: string) =>
    withData<any>('/api/deliveries/customer/active', {}, token),

  sendMessage: (deliveryId: string, content: string, token: string) =>
    withData<any>(`/api/deliveries/${deliveryId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type: 'TEXT' }),
    }, token),

  sendVoiceNote: (deliveryId: string, voiceNoteUrl: string, durationSecs: number, token: string) =>
    withData<any>(`/api/deliveries/${deliveryId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ voiceNoteUrl, durationSecs, type: 'VOICE_NOTE', content: '' }),
    }, token),

  initiateCall: (deliveryId: string, receiverId: string, token: string) =>
    withData<any>(`/api/deliveries/${deliveryId}/calls`, {
      method: 'POST',
      body: JSON.stringify({ receiverId }),
    }, token),

  updateCall: (deliveryId: string, callId: string, data: any, token: string) =>
    withData<any>(`/api/deliveries/${deliveryId}/calls/${callId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, token),

  cancelDelivery: (id: string, body: any, token: string) =>
    withData<any>(`/api/deliveries/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) }, token),

  // ── Admin ─────────────────────────────────────────────────
  adminStats: (token: string) =>
    withData<any>('/api/admin/stats', {}, token),

  adminUsers: (params: string, token: string) =>
    request<any>(`/api/admin/users?${params}`, {}, token),

  adminUser: (id: string, token: string) =>
    withData<any>(`/api/admin/users/${id}`, {}, token),

  updateUser: (id: string, data: any, token: string) =>
    withData<any>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),

  deactivateUser: (id: string, token: string) =>
    withData<any>(`/api/admin/users/${id}`, { method: 'DELETE' }, token),

  adminDeliveries: (params: string, token: string) =>
    request<any>(`/api/admin/deliveries?${params}`, {}, token),

  adminRevenue: (token: string) =>
    withData<any[]>('/api/admin/revenue', {}, token),

  adminBusinesses: (token: string) =>
    withData<any[]>('/api/admin/businesses', {}, token),

  platformConfig: (token: string) =>
    withData<any>('/api/admin/platform-config', {}, token),

  updatePlatformConfig: (data: any, token: string) =>
    withData<any>('/api/admin/platform-config', { method: 'PATCH', body: JSON.stringify(data) }, token),

  rateConfigs: (token: string) =>
    withData<any[]>('/api/admin/rate-configs', {}, token),

  // ── Business ──────────────────────────────────────────────
  businessProfile: (token: string) =>
    withData<any>('/api/businesses/profile', {}, token),

  updateBusinessProfile: (data: any, token: string) =>
    withData<any>('/api/businesses/profile', { method: 'PATCH', body: JSON.stringify(data) }, token),

  businessRiders: (token: string) =>
    withData<any[]>('/api/businesses/riders', {}, token),

  inviteRider: (email: string, token: string) =>
    withData<any>('/api/businesses/riders/invite', { method: 'POST', body: JSON.stringify({ email }) }, token),

  registerRider: (data: { name: string; email: string; phone?: string; vehicleType: string; vehiclePlate?: string }, token: string) =>
    withData<{ rider: { id: string; name: string; email: string }; tempPassword: string }>('/api/businesses/riders/register', {
      method: 'POST', body: JSON.stringify(data),
    }, token),

  removeRider: (riderId: string, token: string) =>
    withData<any>(`/api/businesses/riders/${riderId}`, { method: 'DELETE' }, token),

  businessDeliveries: (page = 1, token?: string) =>
    request<any>(`/api/businesses/deliveries?page=${page}`, {}, token),

  businessStats: (token: string) =>
    withData<any>('/api/businesses/stats', {}, token),

  // ── Payments ──────────────────────────────────────────────
  initDeliveryPayment: (deliveryId: string, token: string) =>
    withData<any>('/api/payments/delivery/initialize', { method: 'POST', body: JSON.stringify({ deliveryId }) }, token),

  verifyDeliveryPayment: (reference: string, token: string) =>
    withData<any>(`/api/payments/delivery/verify?reference=${reference}`, {}, token),

  initSubscription: (token: string) =>
    withData<any>('/api/payments/subscription/initialize', { method: 'POST' }, token),

  verifySubscription: (reference: string, token: string) =>
    withData<any>(`/api/payments/subscription/verify?reference=${reference}`, {}, token),
};
