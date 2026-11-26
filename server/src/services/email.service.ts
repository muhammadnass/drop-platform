// ============================================================
// VELTO MOBILITY PLATFORM — Email Service (Resend)
//
// Previously this sent mail via direct SMTP to Gmail (nodemailer). On
// Render that connection consistently timed out at the TCP level
// (ETIMEDOUT on CONN, before any SMTP greeting) — Render's outbound
// network blocks/restricts raw SMTP ports, a common restriction on
// shared PaaS infrastructure to stop spam abuse. No SMTP credential was
// ever going to fix that, because the connection itself never got
// through. Resend sends mail over a plain HTTPS API call instead, which
// is never blocked the way SMTP ports are.
//
// Required env vars:
//   RESEND_API_KEY   from https://resend.com/api-keys
//   EMAIL_FROM       e.g. "Velto <noreply@veltomobility.com.ng>" — must be
//                    on a domain verified in Resend. Until a domain is
//                    verified, falls back to Resend's shared sandbox
//                    address (onboarding@resend.dev), which only delivers
//                    to the email address the Resend account itself was
//                    signed up with.
//   APP_URL          e.g. https://app.veltomobility.com.ng
// ============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? 'Velto <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set — cannot send email.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F0F8FF;font-family:Inter,Arial,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(14,123,196,0.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0A1628,#0D2040);padding:32px 40px;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:10px">
        <svg width="36" height="36" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0E7BC4"/>
            <stop offset="100%" stop-color="#06C4A8"/>
          </linearGradient></defs>
          <rect width="48" height="48" rx="13" fill="url(#g)"/>
          <polygon points="8,12 18,12 24,36 20,36" fill="white"/>
          <polygon points="30,12 40,12 28,36 24,36" fill="white"/>
        </svg>
        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Velto</span>
      </div>
    </div>
    <!-- Body -->
    <div style="padding:40px">
      <h2 style="font-size:22px;font-weight:700;color:#0A1628;margin:0 0 12px">Reset your password</h2>
      <p style="font-size:15px;color:#64748B;line-height:1.65;margin:0 0 28px">
        Hi ${name}, we received a request to reset the password for your Velto account.
        Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:block;text-align:center;background:linear-gradient(135deg,#0E7BC4,#06C4A8);color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 24px;border-radius:10px;margin-bottom:24px">
        Reset Password
      </a>
      <p style="font-size:13px;color:#94A3B8;line-height:1.6;margin:0">
        If you didn't request a password reset, you can safely ignore this email.
        Your password will not change.<br><br>
        Or copy this link into your browser:<br>
        <a href="${resetUrl}" style="color:#0E7BC4;word-break:break-all">${resetUrl}</a>
      </p>
    </div>
    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid #E8F4FD;text-align:center">
      <p style="font-size:12px;color:#94A3B8;margin:0">
        Velto Mobility Platform Limited &nbsp;·&nbsp; Nigeria
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nReset your Velto password by visiting:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.\n\nVelto Mobility Platform Limited`;

  await sendEmail(email, 'Reset your Velto password', html, text);
}
