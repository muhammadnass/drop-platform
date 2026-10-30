// ============================================================
// DROP LOGISTICS — Shared TypeScript Types
// ============================================================

// ── Enums ────────────────────────────────────────────────────

export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'BUSINESS_OWNER' | 'RIDER' | 'CUSTOMER';

export type VehicleType = 'MOTORBIKE' | 'CAR' | 'TRICYCLE' | 'MINIVAN';

export type VehicleTier = 'DROP_MINI' | 'DROP_TRI' | 'DROP_FLEX' | 'DROP_MAX';

export type DeliveryStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'ARRIVED_PICKUP'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'TRIALING';

export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';

export type Language = 'en' | 'ha';

// ── Core Entities ────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  avatarUrl?: string;
  role: Role;
  isActive: boolean;
  languagePref: Language;
  createdAt: string;
  updatedAt: string;
}

export interface RiderProfile {
  id: string;
  userId: string;
  businessId?: string;
  vehicleTier: VehicleTier;
  vehicleType: VehicleType;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  isOnline: boolean;
  isVerified: boolean;
  lastLatitude?: number;
  lastLongitude?: number;
  lastSeenAt?: string;
  rating: number;
  totalDeliveries: number;
  wallet?: Wallet;
}

export interface Wallet {
  id: string;
  riderId: string;
  balanceNgn: number;
  lifetimeEarningsNgn: number;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: 'EARNING' | 'WITHDRAWAL' | 'BONUS' | 'DEDUCTION';
  amountNgn: number;
  balanceAfter: number;
  description?: string;
  referenceId?: string;
  createdAt: string;
}

export interface CancellationReason {
  id: string;
  code: string;
  label: string;
  labelHausa?: string;
  forRole: 'RIDER' | 'CUSTOMER';
  sortOrder: number;
  isActive: boolean;
}

export interface Message {
  id: string;
  deliveryId: string;
  senderId: string;
  content: string;
  readAt?: string;
  createdAt: string;
}

export interface Call {
  id: string;
  deliveryId: string;
  callerId: string;
  receiverId: string;
  status: 'INITIATED' | 'ANSWERED' | 'MISSED' | 'ENDED';
  durationSecs?: number;
  createdAt: string;
}

export interface Business {
  id: string;
  ownerId: string;
  managerId?: string;
  name: string;
  logoUrl?: string;
  description?: string;
  address?: string;
  website?: string;
  industry?: string;
  isVerified: boolean;
  customBranding?: {
    primaryColor?: string;
    welcomeMessage?: string;
    logoUrl?: string;
  };
}

export interface Subscription {
  id: string;
  businessId: string;
  status: SubscriptionStatus;
  monthlyFeeUsd: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

// ── Delivery Types ───────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DeliveryLocation {
  address: string;
  lat: number;
  lng: number;
}

export interface Delivery {
  id: string;
  customerId: string;
  riderId?: string;
  businessId?: string;
  vehicleTier: VehicleTier;
  status: DeliveryStatus;
  pickup: DeliveryLocation;
  dropoff: DeliveryLocation;
  distanceKm: number;
  baseFareNgn: number;
  ratePerKmNgn: number;
  tierMultiplier: number;
  totalFareNgn: number;
  platformFeeNgn: number;
  riderEarningsNgn: number;
  paymentStatus: PaymentStatus;
  notes?: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  arrivedPickupAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReasonId?: string;
  cancellationNote?: string;
  estimatedPickupSecs?: number;
  estimatedDeliverySecs?: number;
  createdAt: string;
  updatedAt: string;
  // Populated relations
  customer?: User;
  rider?: User;
  messages?: Message[];
  calls?: Call[];
}

// ── Fare Calculation ─────────────────────────────────────────

export interface FareInput {
  distanceKm: number;
  vehicleTier: VehicleTier;
  baseFareNgn?: number;
  ratePerKmNgn?: number;
}

export interface FareBreakdown {
  baseFareNgn: number;
  distanceCharge: number;
  tierMultiplier: number;
  subtotal: number;
  platformFeeNgn: number;
  totalFareNgn: number;
  riderEarningsNgn: number;
  distanceKm: number;
  vehicleTier: VehicleTier;
}

// ── Socket Events ────────────────────────────────────────────

export interface RiderLocationPayload {
  riderId: string;
  deliveryId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface DeliveryStatusPayload {
  deliveryId: string;
  status: DeliveryStatus;
  riderId?: string;
  timestamp: number;
}

export interface NewOrderPayload {
  delivery: Delivery;
}

// ── Rate Configuration ────────────────────────────────────────

export interface RateConfig {
  id: string;
  vehicleTier: VehicleTier;
  vehicleType?: VehicleType;
  tierMultiplier: number;
  tierLabel: string;
  tierDescription: string;
  maxWeightKg?: number;
  isActive: boolean;
}

export interface PlatformConfig {
  baseFareNgn: number;
  ratePerKmNgn: number;
  commissionPct: number;
}

// ── API Response Wrappers ────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ── Vehicle Tier Metadata ────────────────────────────────────

export const VEHICLE_TIER_META: Record<
  VehicleTier,
  { label: string; description: string; icon: string; multiplier: number }
> = {
  DROP_MINI: {
    label: 'Drop Mini',
    description: 'Motorbike · Parcels & documents',
    icon: '🏍️',
    multiplier: 1.0,
  },
  DROP_TRI: {
    label: 'Drop Tri',
    description: 'Tricycle · Medium loads up to 50kg',
    icon: '🛺',
    multiplier: 1.3,
  },
  DROP_FLEX: {
    label: 'Drop Flex',
    description: 'Car/Sedan · Fragile goods & catering',
    icon: '🚗',
    multiplier: 1.5,
  },
  DROP_MAX: {
    label: 'Drop Max',
    description: 'Minivan · Bulk & furniture up to 500kg',
    icon: '🚐',
    multiplier: 2.2,
  },
};

// ── Vehicle Type → Tier Map ───────────────────────────────────

export const VEHICLE_TYPE_TIER: Record<VehicleType, VehicleTier> = {
  MOTORBIKE: 'DROP_MINI',
  TRICYCLE:  'DROP_TRI',
  CAR:       'DROP_FLEX',
  MINIVAN:   'DROP_MAX',
};
