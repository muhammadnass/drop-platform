// ============================================================
// VELTO MOBILITY PLATFORM — Email Service (Nodemailer)
// Sends transactional emails via SMTP (Gmail recommended).
//
// Required env vars:
//   SMTP_HOST     e.g. smtp.gmail.com
//   SMTP_PORT     e.g. 465
//   SMTP_SECURE   true for 465, false for 587
//   SMTP_USER     your Gmail address
//   SMTP_PASS     your Gmail App Password (not your login password)
//   SMTP_FROM     e.g. "Velto <noreply@veltomobility.com>"
//   APP_URL       e.g. https://your-app.vercel.app
// ============================================================

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT ?? '465'),
  secure: process.env.SMTP_SECURE !== 'false', // true by default (port 465)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM ?? 'Velto <noreply@veltomobility.com>';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: 'Reset your Velto password',
    html: `
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
</html>`,
    text: `Hi ${name},\n\nReset your Velto password by visiting:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.\n\nVelto Mobility Platform Limited`,
  });
}
