import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';

import { env } from '~/consts/env';

export type EmailConfig = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailProvider = 'resend' | 'smtp' | 'console';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export function getProvider(): EmailProvider {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SMTP_HOST) return 'smtp';
  return 'console';
}

export function getSmtpConfig(): SmtpConfig {
  return {
    host: env.SMTP_HOST || 'localhost',
    port: Number.parseInt(env.SMTP_PORT, 10),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM
  };
}

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (!smtpTransporter) {
    const config = getSmtpConfig();
    smtpTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user
        ? {
            user: config.user,
            pass: config.password
          }
        : undefined
    });
  }
  return smtpTransporter;
}

export async function sendEmail(config: EmailConfig): Promise<{ success: boolean; error?: string }> {
  const provider = getProvider();

  try {
    if (provider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: config.from,
          to: config.to,
          subject: config.subject,
          html: config.html,
          text: config.text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      return { success: true };
    }

    if (provider === 'smtp') {
      const transporter = getSmtpTransporter();
      await transporter.sendMail({
        from: config.from,
        to: config.to,
        subject: config.subject,
        html: config.html,
        text: config.text
      });
      return { success: true };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function getFromAddress(): string {
  const provider = getProvider();
  if (provider === 'smtp') {
    return getSmtpConfig().from;
  }
  return env.EMAIL_FROM;
}
