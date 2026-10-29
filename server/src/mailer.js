import { cfg } from './config.js';

let transporter;
export async function sendOtp(email, code) {
  if (!cfg.smtp.host) {
    console.log(`\n  [mail:dev] OTP for ${email} -> ${code}\n`);
    return false;
  }
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465,
      auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
    });
  }
  await transporter.sendMail({
    from: cfg.smtp.from, to: email, subject: `Your TimeBank code: ${code}`,
    text: `Your TimeBank verification code is ${code}. It expires in 10 minutes.`,
  });
  return true;
}
