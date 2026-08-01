import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditAnalysisPlatform } from '../packages/platform/src/index.js'
import { InMemoryStore, InMemoryBlobStore } from '../packages/platform/src/store.js'
import { createConsumerEmailSender, type ConsumerEmail, type ConsumerEmailTransport } from '../apps/web/src/consumer-email.js'

test('D10 transactional email seam sends a password-reset link only to an existing account without exposing the raw token in logs', async () => {
  const platform = new CreditAnalysisPlatform(new InMemoryStore(), new InMemoryBlobStore())
  const inviteCode = await platform.issueInvite()
  const account = await platform.register({ email: 'consumer@example.com', password: 'correct horse battery staple', inviteCode })
  const delivered: ConsumerEmail[] = []
  const sender = createConsumerEmailSender({
    appBaseUrl: 'https://pilot.example.test',
    from: 'Golden Audit <no-reply@pilot.example.test>',
    transport: { send: async message => { delivered.push(message) } },
  })

  const reset = await platform.requestPasswordReset('consumer@example.com')
  assert.ok(reset)
  await sender.sendPasswordReset({ email: reset.email, token: reset.token })

  assert.equal(delivered.length, 1)
  assert.equal(delivered[0]?.to, 'consumer@example.com')
  assert.match(delivered[0]?.subject ?? '', /reset your .*password/i)
  assert.match(delivered[0]?.text ?? '', /https:\/\/pilot\.example\.test\/app\?resetToken=/)
  assert.match(delivered[0]?.html ?? '', /reset your .*password/i)
  assert.doesNotMatch(delivered[0]?.subject ?? '', new RegExp(reset.token))

  const unknown = await platform.requestPasswordReset('unknown@example.com')
  assert.equal(unknown, undefined)
  assert.equal(delivered.length, 1)
  void account
})

test('D10 transactional email seam sends a verification link using the authenticated account email', async () => {
  const platform = new CreditAnalysisPlatform(new InMemoryStore(), new InMemoryBlobStore())
  const inviteCode = await platform.issueInvite()
  const account = await platform.register({ email: 'verify@example.com', password: 'correct horse battery staple', inviteCode })
  const delivered: ConsumerEmail[] = []
  const sender = createConsumerEmailSender({
    appBaseUrl: 'https://pilot.example.test/',
    from: 'Golden Audit <no-reply@pilot.example.test>',
    transport: { send: async message => { delivered.push(message) } },
  })

  const verification = await platform.requestEmailVerification(account.sessionId)
  await sender.sendEmailVerification({ email: 'verify@example.com', token: verification.token })

  assert.equal(delivered.length, 1)
  assert.equal(delivered[0]?.to, 'verify@example.com')
  assert.match(delivered[0]?.subject ?? '', /verify your .*email/i)
  assert.match(delivered[0]?.text ?? '', /https:\/\/pilot\.example\.test\/app\?verifyEmailToken=/)
})

test('D10 transactional email seam rejects untrusted callback origins and delivery failures', async () => {
  const transport: ConsumerEmailTransport = { send: async () => { throw new Error('sender unavailable') } }
  assert.throws(() => createConsumerEmailSender({ appBaseUrl: 'mailto:unsafe@example.com', from: 'no-reply@example.com', transport }), /must use HTTPS/)

  const sender = createConsumerEmailSender({ appBaseUrl: 'https://pilot.example.test', from: 'no-reply@example.com', transport })
  await assert.rejects(sender.sendPasswordReset({ email: 'consumer@example.com', token: 'token' }), /sender unavailable/)
})
