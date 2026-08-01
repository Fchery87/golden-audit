export type ConsumerEmail = {
  to: string
  from: string
  subject: string
  text: string
  html: string
}

export interface ConsumerEmailTransport {
  send(message: ConsumerEmail): Promise<void>
}

type SendLinkInput = { email: string; token: string }

export interface ConsumerEmailSender {
  sendPasswordReset(input: SendLinkInput): Promise<void>
  sendEmailVerification(input: SendLinkInput): Promise<void>
}

type ConsumerEmailSenderOptions = {
  appBaseUrl: string
  from: string
  transport: ConsumerEmailTransport
}

function callbackUrl(appBaseUrl: string, parameter: 'resetToken' | 'verifyEmailToken', token: string): string {
  const url = new URL(appBaseUrl)
  if (url.protocol !== 'https:') throw new Error('Consumer email callback URL must use HTTPS')
  url.pathname = url.pathname.replace(/\/$/, '') || '/app'
  url.search = ''
  url.hash = ''
  url.searchParams.set(parameter, token)
  return url.toString()
}

function passwordResetEmail(options: ConsumerEmailSenderOptions, input: SendLinkInput): ConsumerEmail {
  const link = callbackUrl(options.appBaseUrl, 'resetToken', input.token)
  return {
    to: input.email,
    from: options.from,
    subject: 'Reset your Golden Audit password',
    text: `Use this secure link to reset your Golden Audit password: ${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this secure link to <a href="${link}">reset your Golden Audit password</a>.</p><p>If you did not request this, you can ignore this email.</p>`,
  }
}

function emailVerificationEmail(options: ConsumerEmailSenderOptions, input: SendLinkInput): ConsumerEmail {
  const link = callbackUrl(options.appBaseUrl, 'verifyEmailToken', input.token)
  return {
    to: input.email,
    from: options.from,
    subject: 'Verify your Golden Audit email',
    text: `Use this secure link to verify your Golden Audit email: ${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this secure link to <a href="${link}">verify your Golden Audit email</a>.</p><p>If you did not request this, you can ignore this email.</p>`,
  }
}

export function createConsumerEmailSender(options: ConsumerEmailSenderOptions): ConsumerEmailSender {
  // Validate deployment configuration eagerly; a bad origin must not create deliverable tokens.
  void callbackUrl(options.appBaseUrl, 'resetToken', 'configuration-check')
  return {
    sendPasswordReset: input => options.transport.send(passwordResetEmail(options, input)),
    sendEmailVerification: input => options.transport.send(emailVerificationEmail(options, input)),
  }
}
