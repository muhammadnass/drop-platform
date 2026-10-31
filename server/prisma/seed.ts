// ============================================================
// DROP LOGISTICS — Database Seed  (full test data)
// ============================================================

import {
  PrismaClient,
  VehicleTier,
  VehicleType,
  Role,
  DeliveryStatus,
  PaymentStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Helper: fare math (mirrors server logic)
const BASE_FARE  = 1500;
const RATE_PER_KM = 500;
const COMMISSION  = 0.08;
const TIER_MULT: Record<VehicleTier, number> = {
  DROP_MINI: 1.0,
  DROP_TRI:  1.3,
  DROP_FLEX: 1.5,
  DROP_MAX:  2.2,
};
function calcFare(km: number, tier: VehicleTier) {
  const mult       = TIER_MULT[tier];
  const totalFare  = (BASE_FARE + km * RATE_PER_KM) * mult;
  const platformFee = totalFare * COMMISSION;
  const riderEarnings = totalFare - platformFee;
  return {
    distanceKm:       km,
    baseFareNgn:      BASE_FARE,
    ratePerKmNgn:     RATE_PER_KM,
    tierMultiplier:   mult,
    totalFareNgn:     Math.round(totalFare),
    platformFeeNgn:   Math.round(platformFee),
    riderEarningsNgn: Math.round(riderEarnings),
  };
}

async function hash(pw: string) { return bcrypt.hash(pw, 8); }

async function main() {
  console.log('🌱  Seeding Drop Logistics database…\n');

  // ── Super Admin ────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where:  { email: 'admin@drop.ng' },
    update: { passwordHash: await hash('admin') },
    create: { email: 'admin@drop.ng', passwordHash: await hash('admin'), name: 'Drop Super Admin', role: 'SUPER_ADMIN' },
  });
  console.log('✓  Super Admin:  admin@drop.ng  / admin');

  // ── Manager ────────────────────────────────────────────────
  await prisma.user.upsert({
    where:  { email: 'manager@drop.ng' },
    update: { passwordHash: await hash('manager') },
    create: { email: 'manager@drop.ng', passwordHash: await hash('manager'), name: 'Amina Yusuf', role: 'MANAGER' },
  });
  console.log('✓  Manager:      manager@drop.ng / manager');

  // ── Platform Config ────────────────────────────────────────
  const configs = [
    { key: 'BASE_FARE_NGN',         value: '1500', description: 'Base fare in NGN' },
    { key: 'RATE_PER_KM_NGN',       value: '500',  description: 'Rate per km in NGN' },
    { key: 'COMMISSION_PCT',         value: '8',    description: 'Platform commission %' },
    { key: 'SUBSCRIPTION_USD',       value: '20',   description: 'Monthly subscription in USD' },
    { key: 'RIDER_ACCEPT_TIMEOUT',   value: '30',   description: 'Seconds to accept an order' },
  ];
  for (const cfg of configs) {
    await prisma.platformConfig.upsert({
      where: { key: cfg.key }, update: { value: cfg.value },
      create: { ...cfg, updatedBy: admin.id },
    });
  }
  console.log('✓  Platform configs');

  // ── Rate Configs ───────────────────────────────────────────
  const rateTiers: Array<{ vehicleTier: VehicleTier; vehicleType: VehicleType; tierMultiplier: number; tierLabel: string; tierDescription: string; maxWeightKg: number }> = [
    { vehicleTier: 'DROP_MINI', vehicleType: 'MOTORBIKE', tierMultiplier: 1.0, tierLabel: 'Drop Mini', tierDescription: 'Motorbike — docs, parcels, food', maxWeightKg: 15 },
    { vehicleTier: 'DROP_TRI',  vehicleType: 'TRICYCLE',  tierMultiplier: 1.3, tierLabel: 'Drop Tri',  tierDescription: 'Tricycle — groceries, medium packages', maxWeightKg: 50 },
    { vehicleTier: 'DROP_FLEX', vehicleType: 'CAR',       tierMultiplier: 1.5, tierLabel: 'Drop Flex', tierDescription: 'Car — fragile goods, catering', maxWeightKg: 80 },
    { vehicleTier: 'DROP_MAX',  vehicleType: 'MINIVAN',   tierMultiplier: 2.2, tierLabel: 'Drop Max',  tierDescription: 'Minivan — bulk, appliances', maxWeightKg: 500 },
  ];
  for (const t of rateTiers) {
    await prisma.rateConfig.upsert({
      where: { vehicleTier: t.vehicleTier }, update: { tierMultiplier: t.tierMultiplier, vehicleType: t.vehicleType },
      create: { ...t, updatedBy: admin.id },
    });
  }
  console.log('✓  Rate configs (Mini ×1.0 / Tri ×1.3 / Flex ×1.5 / Max ×2.2)');

  // ── Cancellation Reasons ───────────────────────────────────
  const riderReasons = [
    { code: 'ITEM_TOO_LARGE',    label: 'Item is too large for my vehicle',       sortOrder: 1 },
    { code: 'CUSTOMER_ABSENT',   label: 'Customer not at pickup location',         sortOrder: 2 },
    { code: 'WRONG_ITEM',        label: 'Item does not match description',          sortOrder: 3 },
    { code: 'UNSAFE_LOCATION',   label: 'Pickup location feels unsafe',             sortOrder: 4 },
    { code: 'VEHICLE_BREAKDOWN', label: 'My vehicle broke down',                    sortOrder: 5 },
    { code: 'PROHIBITED_ITEM',   label: 'Item appears to be prohibited/illegal',    sortOrder: 6 },
    { code: 'ADDRESS_WRONG',     label: 'Pickup address is incorrect',              sortOrder: 7 },
    { code: 'EMERGENCY',         label: 'Personal emergency',                       sortOrder: 8 },
    { code: 'OTHER',             label: 'Other reason',                             sortOrder: 9 },
  ];
  const customerReasons = [
    { code: 'CHANGED_MIND',     label: 'I changed my mind',              sortOrder: 1 },
    { code: 'WRONG_ADDRESS',    label: 'I entered the wrong address',     sortOrder: 2 },
    { code: 'RIDER_TOO_SLOW',   label: 'Rider is taking too long',        sortOrder: 3 },
    { code: 'FOUND_ALTERNATIVE',label: 'Found another delivery option',   sortOrder: 4 },
    { code: 'EMERGENCY',        label: 'Personal emergency',              sortOrder: 5 },
  ];
  for (const r of riderReasons) {
    await prisma.cancellationReason.upsert({
      where: { code: r.code }, update: {},
      create: { ...r, forRole: 'RIDER' },
    });
  }
  for (const r of customerReasons) {
    // EMERGENCY already exists for RIDER — use a prefixed code for CUSTOMER
    const code = r.code === 'EMERGENCY' ? 'CUST_EMERGENCY' : r.code;
    await prisma.cancellationReason.upsert({
      where: { code }, update: {},
      create: { ...r, code, forRole: 'CUSTOMER' },
    });
  }
  console.log('✓  Cancellation reasons');

  // ── Business Owner 1 — KanoFresh (active subscription) ────
  const owner1 = await prisma.user.upsert({
    where:  { email: 'owner@kanofresh.ng' },
    update: { passwordHash: await hash('owner') },
    create: { email: 'owner@kanofresh.ng', passwordHash: await hash('owner'), name: 'Ibrahim Musa', role: 'BUSINESS_OWNER' },
  });
  const biz1 = await prisma.business.upsert({
    where:  { ownerId: owner1.id },
    update: {},
    create: { ownerId: owner1.id, name: 'KanoFresh Groceries', industry: 'Grocery & FMCG', address: '14 Bompai Rd, Kano' },
  });
  await prisma.subscription.upsert({
    where:  { businessId: biz1.id },
    update: {},
    create: {
      businessId:          biz1.id,
      status:              'ACTIVE',
      currentPeriodStart:  new Date('2025-10-01'),
      currentPeriodEnd:    new Date('2025-11-01'),
    },
  });
  console.log('✓  Business 1:   owner@kanofresh.ng  / owner  (ACTIVE subscription)');

  // ── Business Owner 2 — AbujaMeds (no subscription) ────────
  const owner2 = await prisma.user.upsert({
    where:  { email: 'owner@abujameds.ng' },
    update: { passwordHash: await hash('owner') },
    create: { email: 'owner@abujameds.ng', passwordHash: await hash('owner'), name: 'Fatima Aliyu', role: 'BUSINESS_OWNER' },
  });
  await prisma.business.upsert({
    where:  { ownerId: owner2.id },
    update: {},
    create: { ownerId: owner2.id, name: 'AbujaMeds Pharmacy', industry: 'Healthcare', address: '5 Wuse Zone 3, Abuja' },
  });
  console.log('✓  Business 2:   owner@abujameds.ng  / owner  (no subscription)');

  // ── 5 Riders ───────────────────────────────────────────────
  const riderData = [
    { email: 'rider1@drop.ng', name: 'Chukwuemeka Obi',   tier: 'DROP_MINI' as VehicleTier, type: 'MOTORBIKE' as VehicleType, plate: 'KN-234-AB', model: 'Bajaj Boxer', color: 'Red',    online: true,  balance: 48500, lifetime: 286000 },
    { email: 'rider2@drop.ng', name: 'Suleiman Garba',    tier: 'DROP_MINI' as VehicleTier, type: 'MOTORBIKE' as VehicleType, plate: 'KN-901-YZ', model: 'Honda CG125', color: 'Black',  online: true,  balance: 12300, lifetime: 94000  },
    { email: 'rider3@drop.ng', name: 'Ngozi Eze',         tier: 'DROP_TRI'  as VehicleTier, type: 'TRICYCLE'  as VehicleType, plate: 'AB-012-KE', model: 'TVS King',   color: 'Yellow', online: false, balance: 5000,  lifetime: 31000  },
    { email: 'rider4@drop.ng', name: 'Adamu Isah',        tier: 'DROP_FLEX' as VehicleTier, type: 'CAR'       as VehicleType, plate: 'AB-556-RS', model: 'Toyota Corolla', color: 'Blue', online: true, balance: 61000, lifetime: 420000 },
    { email: 'rider5@drop.ng', name: 'Blessing Nwosu',    tier: 'DROP_MAX'  as VehicleTier, type: 'MINIVAN'   as VehicleType, plate: 'LG-777-MX', model: 'Toyota HiAce', color: 'White', online: false, balance: 0,    lifetime: 0      },
  ];

  const riders: { user: any; profile: any; wallet: any }[] = [];
  for (const r of riderData) {
    const user = await prisma.user.upsert({
      where: { email: r.email },
      update: { passwordHash: await hash('rider') },
      create: { email: r.email, passwordHash: await hash('rider'), name: r.name, role: 'RIDER' },
    });
    const profile = await prisma.riderProfile.upsert({
      where: { userId: user.id }, update: { isOnline: r.online },
      create: {
        userId: user.id, businessId: r.email === 'rider1@drop.ng' ? biz1.id : null,
        vehicleType: r.type, vehicleTier: r.tier,
        vehiclePlate: r.plate, vehicleModel: r.model, vehicleColor: r.color,
        isOnline: r.online, isVerified: true, rating: 4.8 + Math.random() * 0.2,
        totalDeliveries: Math.floor(r.lifetime / 2500),
        lastLatitude: 12.0022 + Math.random() * 0.05, lastLongitude: 8.5920 + Math.random() * 0.05,
      },
    });
    const wallet = await prisma.wallet.upsert({
      where: { riderId: profile.id }, update: {},
      create: { riderId: profile.id, balanceNgn: r.balance, lifetimeEarningsNgn: r.lifetime },
    });
    riders.push({ user, profile, wallet });
  }
  console.log('✓  Riders (5):  rider1@drop.ng … rider5@drop.ng  / rider');

  // ── 4 Customers ────────────────────────────────────────────
  const customerData = [
    { email: 'customer1@test.ng', name: 'Amara Chukwu'    },
    { email: 'customer2@test.ng', name: 'Yusuf Abdullahi' },
    { email: 'customer3@test.ng', name: 'Grace Onyeka'    },
    { email: 'customer4@test.ng', name: 'Hassan Bello'    },
  ];
  const customers: any[] = [];
  for (const c of customerData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { passwordHash: await hash('customer') },
      create: { email: c.email, passwordHash: await hash('customer'), name: c.name, role: 'CUSTOMER' },
    });
    await prisma.customerProfile.upsert({
      where: { userId: user.id }, update: {},
      create: { userId: user.id },
    });
    customers.push(user);
  }
  console.log('✓  Customers (4): customer1@test.ng … customer4@test.ng  / customer');

  // ── Helper: create a delivery ──────────────────────────────
  async function makeDelivery(params: {
    customer: any; rider?: any; business?: any;
    status: DeliveryStatus; tier: VehicleTier;
    pickup: string; dropoff: string; km: number;
    paymentStatus?: PaymentStatus;
    daysAgo?: number;
  }) {
    const fare = calcFare(params.km, params.tier);
    const daysAgo  = params.daysAgo ?? 0;
    const created  = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const accepted = params.status !== 'PENDING' && params.status !== 'CANCELLED'
      ? new Date(created.getTime() + 2 * 60 * 1000) : undefined;
    const delivered = params.status === 'DELIVERED'
      ? new Date(created.getTime() + 35 * 60 * 1000) : undefined;
    const cancelled = params.status === 'CANCELLED'
      ? new Date(created.getTime() + 5 * 60 * 1000) : undefined;

    return prisma.delivery.create({
      data: {
        customerId:  params.customer.id,
        riderId:     params.rider?.id,
        businessId:  params.business?.id ?? null,
        vehicleTier: params.tier,
        status:      params.status,
        pickupAddress:  params.pickup,
        pickupLat:   12.0022 + Math.random() * 0.05,
        pickupLng:   8.5920  + Math.random() * 0.05,
        dropoffAddress: params.dropoff,
        dropoffLat:  12.0522 + Math.random() * 0.05,
        dropoffLng:  8.6420  + Math.random() * 0.05,
        ...fare,
        paymentStatus: params.paymentStatus ?? (params.status === 'DELIVERED' ? 'PAID' : 'PENDING'),
        estimatedPickupSecs:   8 * 60,
        estimatedDeliverySecs: 25 * 60,
        acceptedAt:  accepted,
        deliveredAt: delivered,
        cancelledAt: cancelled,
        createdAt:   created,
      },
    });
  }

  // ── Deliveries ─────────────────────────────────────────────

  // 1. PENDING — awaiting rider
  await makeDelivery({
    customer: customers[0], tier: 'DROP_MINI', status: 'PENDING',
    pickup: 'Sabon Gari Market, Kano', dropoff: 'Bompai Industrial Area, Kano', km: 4.2,
  });

  // 2. ACCEPTED — rider heading to pickup
  await makeDelivery({
    customer: customers[1], rider: riders[0].user, tier: 'DROP_MINI', status: 'ACCEPTED',
    pickup: 'Kofar Mata, Kano Old City', dropoff: 'NTA Road, Kano', km: 3.8,
  });

  // 3. ARRIVED_PICKUP — rider at location
  await makeDelivery({
    customer: customers[2], rider: riders[1].user, tier: 'DROP_TRI', status: 'ARRIVED_PICKUP',
    pickup: 'Wuse Market, Abuja', dropoff: 'Gwarinpa Estate, Abuja', km: 7.1,
  });

  // 4. IN_TRANSIT — package on the way
  await makeDelivery({
    customer: customers[3], rider: riders[3].user, tier: 'DROP_FLEX', status: 'IN_TRANSIT',
    pickup: 'Garki Area 11, Abuja', dropoff: 'Maitama, Abuja', km: 5.5,
  });

  // 5-10. DELIVERED — completed orders (various days ago, various tiers)
  const deliveredData = [
    { cust: customers[0], rider: riders[0].user, tier: 'DROP_MINI' as VehicleTier, km: 2.1, pickup: 'Tudun Wada, Kano', dropoff: 'Nassarawa GRA, Kano', days: 1 },
    { cust: customers[0], rider: riders[1].user, tier: 'DROP_MINI' as VehicleTier, km: 5.3, pickup: 'Rijiyar Zaki, Kano', dropoff: 'Kano Airport Area', days: 3 },
    { cust: customers[1], rider: riders[3].user, tier: 'DROP_FLEX' as VehicleTier, km: 8.7, pickup: 'Wuse Zone 4, Abuja', dropoff: 'Asokoro, Abuja', days: 2 },
    { cust: customers[2], rider: riders[2].user, tier: 'DROP_TRI'  as VehicleTier, km: 3.4, pickup: 'Nyanya, Abuja', dropoff: 'Karu Market, Abuja', days: 5 },
    { cust: customers[3], rider: riders[0].user, tier: 'DROP_MAX'  as VehicleTier, km: 12.0, pickup: 'Ikeja GRA, Lagos', dropoff: 'Surulere, Lagos', days: 7 },
    { cust: customers[0], rider: riders[3].user, tier: 'DROP_FLEX' as VehicleTier, km: 6.2, pickup: 'Banana Island, Lagos', dropoff: 'Victoria Island, Lagos', days: 14 },
  ];
  for (const d of deliveredData) {
    await makeDelivery({
      customer: d.cust, rider: d.rider, tier: d.tier, status: 'DELIVERED',
      pickup: d.pickup, dropoff: d.dropoff, km: d.km, daysAgo: d.days,
    });
  }

  // 11-12. CANCELLED deliveries
  await makeDelivery({
    customer: customers[1], tier: 'DROP_MINI', status: 'CANCELLED',
    pickup: 'Kano Railway Station', dropoff: 'Fagge, Kano', km: 2.5, daysAgo: 4,
  });
  await makeDelivery({
    customer: customers[2], rider: riders[0].user, tier: 'DROP_TRI', status: 'CANCELLED',
    pickup: 'Lokoja Junction, Abuja', dropoff: 'Nyanya, Abuja', km: 9.0, daysAgo: 6,
  });

  // 13. Business delivery (KanoFresh + active rider)
  await makeDelivery({
    customer: customers[0], rider: riders[0].user, business: biz1, tier: 'DROP_TRI',
    status: 'DELIVERED', pickup: 'KanoFresh Warehouse, Bompai', dropoff: 'Sharada Estate, Kano', km: 6.3, daysAgo: 2,
    paymentStatus: 'PAID',
  });

  console.log('✓  Deliveries (13): PENDING · ACCEPTED · ARRIVED_PICKUP · IN_TRANSIT · 6×DELIVERED · 2×CANCELLED · 1 business');

  // ── Update rider wallet transaction history ────────────────
  // Add a few wallet entries for rider1 so the earnings history page has data
  const r1wallet = riders[0].wallet;
  const txns = [
    { type: 'CREDIT' as const, amount: 8500,  desc: 'Delivery #1 earnings' },
    { type: 'CREDIT' as const, amount: 12000, desc: 'Delivery #2 earnings' },
    { type: 'DEBIT'  as const, amount: 5000,  desc: 'Withdrawal to bank' },
    { type: 'CREDIT' as const, amount: 7200,  desc: 'Delivery #3 earnings' },
    { type: 'BONUS'  as const, amount: 2500,  desc: 'Weekly completion bonus' },
  ];
  let running = r1wallet.balanceNgn;
  for (const tx of txns) {
    running += tx.type === 'DEBIT' ? -tx.amount : tx.amount;
    await prisma.walletTransaction.create({
      data: {
        walletId:    r1wallet.id,
        type:        tx.type,
        amountNgn:   tx.amount,
        balanceAfter: running,
        description:  tx.desc,
      },
    });
  }
  console.log('✓  Wallet transactions for rider1');

  // ── Historical revenue data (fake past months via old deliveries) ──
  // We create a spread of old DELIVERED orders to populate the revenue chart
  const monthOffsets = [150, 120, 90, 60, 30, 7]; // days ago per "month"
  for (let i = 0; i < monthOffsets.length; i++) {
    const count = 3 + i * 2; // more orders as we get closer to today
    for (let j = 0; j < count; j++) {
      const km = 2 + Math.random() * 10;
      const tier = (['DROP_MINI','DROP_TRI','DROP_FLEX'] as VehicleTier[])[j % 3];
      await makeDelivery({
        customer: customers[j % customers.length],
        rider:    riders[j % 3].user,
        tier,
        status:   'DELIVERED',
        pickup:   `Historic Pickup ${i}-${j}`,
        dropoff:  `Historic Dropoff ${i}-${j}`,
        km,
        daysAgo:  monthOffsets[i] + Math.floor(Math.random() * 20),
      });
    }
  }
  console.log('✓  Historical deliveries for revenue chart');

  console.log('\n════════════════════════════════════════════');
  console.log('🚀  Seed complete! Test credentials:\n');
  console.log('  Role            Email                      Password');
  console.log('  ─────────────── ─────────────────────────  ────────');
  console.log('  Super Admin     admin@drop.ng              admin');
  console.log('  Manager         manager@drop.ng            manager');
  console.log('  Business (sub)  owner@kanofresh.ng         owner');
  console.log('  Business (no)   owner@abujameds.ng         owner');
  console.log('  Rider 1-5       rider1@drop.ng … rider5    rider');
  console.log('  Customer 1-4    customer1@test.ng … cust4  customer');
  console.log('════════════════════════════════════════════\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
