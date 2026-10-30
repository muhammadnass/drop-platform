// ============================================================
// DROP LOGISTICS — Next.js Route Protection Middleware
// Redirects unauthenticated users to /auth/login
// Redirects authenticated users away from auth pages
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS  = ['/auth/login', '/auth/register', '/', '/dashboard/customer'];
const ROLE_PATHS: Record<string, string[]> = {
  SUPER_ADMIN:    ['/dashboard/admin'],
  MANAGER:        ['/dashboard/manager'],
  BUSINESS_OWNER: ['/dashboard/owner'],
  RIDER:          ['/dashboard/rider'],
  CUSTOMER:       ['/dashboard/customer'],
};

function getDashboard(role: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN:    '/dashboard/admin',
    MANAGER:        '/dashboard/manager',
    BUSINESS_OWNER: '/dashboard/owner',
    RIDER:          '/dashboard/rider',
    CUSTOMER:       '/dashboard/customer',
  };
  return map[role] ?? '/dashboard/customer';
}

// Lightweight JWT decode — no verification (server handles that)
function decodeTokenRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('drop_token')?.value
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  // No token → send to login (unless already on public path)
  if (!token) {
    if (isPublic) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  const role = decodeTokenRole(token);

  // Token present but on auth page → redirect to dashboard
  if (isPublic && pathname !== '/') {
    if (role) {
      const url = req.nextUrl.clone();
      url.pathname = getDashboard(role);
      return NextResponse.redirect(url);
    }
  }

  // Wrong dashboard for role → redirect to correct one
  if (role && pathname.startsWith('/dashboard')) {
    const allowed = ROLE_PATHS[role] ?? [];
    const ok = allowed.some((p) => pathname.startsWith(p));
    if (!ok) {
      const url = req.nextUrl.clone();
      url.pathname = getDashboard(role);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
