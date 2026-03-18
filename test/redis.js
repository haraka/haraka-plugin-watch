'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const redis = require('redis')
const fixtures = require('haraka-test-fixtures')

function waitFor(condition, timeoutMs = 2000, intervalMs = 20) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (condition()) {
        clearInterval(timer)
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error('timed out waiting for condition'))
      }
    }, intervalMs)
  })
}

async function createSubscribedWatchPlugin() {
  const plugin = new fixtures.plugin('watch')
  plugin.server = { notes: {} }
  plugin.register()
  plugin.load_redis_ini()

  const messages = []
  const fakeWss = {
    clients: new Set([
      {
        readyState: 1,
        send(msg) {
          messages.push(JSON.parse(msg))
        },
      },
    ]),
    on() {},
  }

  plugin.hook_init_wss(() => {}, { http: { wss: fakeWss } })

  await new Promise((resolve) => {
    plugin.redis_subscribe_all_results(resolve)
  })

  const publisher = redis.createClient(plugin.redisCfg.server)
  await publisher.connect()

  async function cleanup() {
    await publisher.quit()
    await plugin.pubsub.quit()
  }

  return { plugin, publisher, messages, cleanup }
}

describe('watch redis integration', function () {
  it('broadcasts remote host updates', async function () {
    const { publisher, messages, cleanup } = await createSubscribedWatchPlugin()
    try {
      const uuid = 'ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123456.1'
      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'remote',
          result: { ip: '203.0.113.9', host: 'mx.example.net' },
        }),
      )

      await waitFor(() => messages.length > 0)

      const last = messages.at(-1)
      assert.equal(last.uuid, uuid)
      assert.equal(last.remote_host.title, 'mx.example.net / 203.0.113.9')
    } finally {
      await cleanup()
    }
  })

  it('ignores non-object result payloads from redis', async function () {
    const { publisher, messages, cleanup } = await createSubscribedWatchPlugin()
    try {
      const uuid = 'ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123457.1'
      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'remote',
          result: 'garbage',
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(messages.length, 0)
    } finally {
      await cleanup()
    }
  })

  it('broadcasts queue smtp_forward pass as green', async function () {
    const { publisher, messages, cleanup } = await createSubscribedWatchPlugin()
    try {
      const uuid = 'ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123458.1'
      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'queue/smtp_forward',
          result: { pass: true },
        }),
      )

      await waitFor(() => messages.length > 0)

      const last = messages.at(-1)
      assert.equal(last.uuid, uuid)
      assert.equal(last['queue/smtp_forward'].classy, 'bg_green')
    } finally {
      await cleanup()
    }
  })

  it('broadcasts local port and tls highlight for SMTPS port', async function () {
    const { publisher, messages, cleanup } = await createSubscribedWatchPlugin()
    try {
      const uuid = 'ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123459.1'
      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'local',
          result: { port: 465 },
        }),
      )

      await waitFor(() => messages.length >= 2)

      assert.equal(messages[0].uuid, uuid)
      assert.equal(messages[0].local_port.newval, 465)
      assert.equal(messages[1].uuid, uuid)
      assert.equal(messages[1].tls.classy, 'bg_green')
    } finally {
      await cleanup()
    }
  })

  it('broadcasts helo host update and outbound queue success', async function () {
    const { publisher, messages, cleanup } = await createSubscribedWatchPlugin()
    try {
      const uuid = 'ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123460.1'
      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'helo',
          result: { host: 'mail.example.net' },
        }),
      )

      await waitFor(() => messages.length >= 1)
      assert.equal(messages[0].uuid, uuid)
      assert.equal(messages[0].helo.newval, 'mail.example.net')

      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'outbound',
          result: { pass: true },
        }),
      )

      await waitFor(() => messages.length >= 2)
      const last = messages.at(-1)
      assert.equal(last.uuid, uuid)
      assert.equal(last.queue.classy, 'bg_green')
    } finally {
      await cleanup()
    }
  })

  it('broadcasts reset/disconnect duration updates', async function () {
    const { publisher, messages, cleanup } = await createSubscribedWatchPlugin()
    try {
      const uuid = 'ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123461.1'

      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'reset',
          result: { duration: 1.25 },
        }),
      )
      await waitFor(() => messages.length >= 1)
      assert.equal(messages[0].queue.newval, '1.3')

      await publisher.publish(
        `result-${uuid}`,
        JSON.stringify({
          plugin: 'disconnect',
          result: { duration: 2.01 },
        }),
      )
      await waitFor(() => messages.length >= 2)
      assert.equal(messages[1].queue.newval, '2.0')
      assert.equal(messages[1].local_port.classy, 'bg_white')
    } finally {
      await cleanup()
    }
  })
})
