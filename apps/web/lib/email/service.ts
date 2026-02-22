import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export type EmailConfig = {
  from: string
  to: string
  subject: string
  html: string
  text?: string
}

export type EmailProvider = 'resend' | 'smtp' | 'console'

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
}

export function getProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SMTP_HOST) return 'smtp'
  return 'console'
}

export function getSmtpConfig(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'noreply@example.com',
  }
}

let smtpTransporter: Transporter | null = null

function getSmtpTransporter(): Transporter {
  if (!smtpTransporter) {
    const config = getSmtpConfig()
    smtpTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? {
        user: config.user,
        pass: config.password,
      } : undefined,
    })
  }
  return smtpTransporter
}

export async function sendEmail(config: EmailConfig): Promise<{ success: boolean; error?: string }> {
  const provider = getProvider()

  try {
    if (provider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.from,
          to: config.to,
          subject: config.subject,
          html: config.html,
          text: config.text,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }
      return { success: true }
    }

    if (provider === 'smtp') {
      const transporter = getSmtpTransporter()
      await transporter.sendMail({
        from: config.from,
        to: config.to,
        subject: config.subject,
        html: config.html,
        text: config.text,
      })
      return { success: true }
    }

    console.log('[EMAIL]', JSON.stringify({ to: config.to, subject: config.subject }, null, 2))
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function getFromAddress(): string {
  const provider = getProvider()
  if (provider === 'smtp') {
    return getSmtpConfig().from
  }
  return process.env.EMAIL_FROM || 'noreply@tank.example.com'
}
