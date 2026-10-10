import FormData from 'form-data';
import Mailgun from 'mailgun.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function client() {
  const mailgun = new Mailgun(FormData);
  return {
    mailer: mailgun.client({ username: 'api', key: requireEnv('MAILGUN_API_KEY') }),
    domain: requireEnv('MAILGUN_DOMAIN'),
    from: requireEnv('MAILGUN_FROM_EMAIL'),
  };
}

export async function sendOtpEmail(to, code) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] OTP for ${to}: ${code}`);
  }
  const { mailer, domain, from } = client();
  await mailer.messages.create(domain, {
    from: `Scriptorium <${from}>`,
    to: [to],
    subject: 'Your Scriptorium verification code',
    text: `Your verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
  });
}
