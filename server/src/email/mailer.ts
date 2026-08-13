import nodemailer from 'nodemailer'

/**
 * Real SMTP sending for drafted part-request emails — optional. When SMTP_HOST/SMTP_USER
 * aren't set (the default), sendMail() is a no-op that returns false, and callers keep
 * treating the request as "sent" for demo/status purposes without anything leaving the
 * laptop. Set the env vars below to actually deliver the drafted email, e.g. to a vendor's
 * real inbox for a live demo.
 */

const SMTP_HOST = process.env.SMTP_HOST ?? ''
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '587')
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER

/**
 * Catch-all recipient. When set, every outgoing message goes here instead of the vendor
 * address stored on the row.
 *
 * The demo database is committed so a deployment ships with realistic history, which means
 * anything in it is as public as the repository. Real inboxes therefore must not be seeded
 * into `vendors` — the shipped rows carry placeholder addresses, and the one address that
 * should actually receive demo mail is supplied privately through the environment at
 * deploy time. Left unset (the normal local case) delivery is unchanged.
 *
 * Applied inside sendMail rather than at the three call sites so it cannot be bypassed by
 * a future sender that forgets about it.
 */
const DEMO_RECIPIENT = process.env.DEMO_VENDOR_EMAIL ?? ''

export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // Nodemailer's defaults are 2 minutes to connect and 10 on the socket, which suit a
      // background mail queue and not a request a person is waiting on. Cloud hosts
      // frequently block outbound SMTP, and a blocked port does not refuse the connection
      // — it swallows it, so the default is the full two-minute hang. These ceilings turn
      // an unreachable mail server into a fast, logged failure.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }
  return transporter
}

/**
 * Never throws — returns whether a real email was actually sent. `html` is optional; when
 * given it's sent alongside the plain text as a multipart alternative, so clients that
 * block HTML still get the readable version.
 */
/**
 * Send without making the caller wait for the mail server.
 *
 * Delivery is not part of the decision being recorded. Approving a part request is a
 * supervisor's judgement that is already persisted; whether the vendor's mail host answers
 * in 200ms or 20s has no bearing on it, and blocking the HTTP response on that turns a
 * one-click action into an indefinite spinner. Nothing reads the result — a failed send has
 * always left the status at "sent" — so awaiting it only ever cost latency.
 *
 * Failures are logged rather than surfaced: the screen genuinely cannot tell you delivery
 * failed, so the server log is where to look when an expected message never arrives.
 */
export function queueMail(to: string, subject: string, body: string, html?: string): void {
  void sendMail(to, subject, body, html)
    .then((ok) => {
      if (!ok) console.error(`queueMail: delivery failed or not configured — "${subject}"`)
    })
    .catch((err) => console.error('queueMail: unexpected error', err))
}

export async function sendMail(to: string, subject: string, body: string, html?: string): Promise<boolean> {
  if (!isEmailConfigured()) return false
  try {
    const recipient = DEMO_RECIPIENT || to
    await getTransporter().sendMail({
      from: SMTP_FROM,
      to: recipient,
      subject,
      text: body,
      ...(html ? { html } : {}),
    })
    return true
  } catch (err) {
    console.error('sendMail failed:', err)
    return false
  }
}
