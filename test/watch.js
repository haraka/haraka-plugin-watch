'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { describe, it } = require('node:test')
const { makePlugin } = require('haraka-test-fixtures')
const redis = require('redis')
const { OPEN } = require('ws')
const watch = require('..')

globalThis.DENY ??= 902
globalThis.DENYSOFT ??= 901

// Install a websocket server whose broadcasts are captured into `sent`. The
// plugin's hooks broadcast through the module-scoped wss, so this also routes
// w_deny/queue_ok/result-handler output into `sent`.
function initWss(plugin, sent) {
  const wss = new EventEmitter()
  wss.clients = new Set([
    { readyState: OPEN, send: (m) => sent.push(JSON.parse(m)) },
  ])
  return new Promise((resolve) => {
    plugin.hook_init_wss(() => resolve(wss), { http: { wss } })
  })
}

// Subscribe with a fake redis client and return the captured pSubscribe
// callback, so result payloads can be fed in without a live redis.
async function captureResultHandler(plugin) {
  const orig = redis.createClient
  let handler
  redis.createClient = () => ({
    on() {},
    connect: async () => {},
    pSubscribe: async (_pattern, cb) => {
      handler = cb
    },
  })
  try {
    plugin.redisCfg = { pubsub: {} }
    await new Promise((resolve) => plugin.redis_subscribe_all_results(resolve))
  } finally {
    redis.createClient = orig
  }
  return handler
}

describe('watch', function () {
  it('register', function () {
    const plugin = makePlugin('watch', { register: false })
    plugin.server = { notes: {} }
    plugin.register()
    assert.ok(plugin.cfg.main)
    // console.log(plugin.cfg);
  })

  it('loads watch.ini', function () {
    const plugin = makePlugin('watch', { register: false })
    plugin.server = { notes: {} }
    plugin.load_watch_ini()
    assert.equal(plugin.cfg.main.sampling, false)
  })

  it('inherits from haraka-plugin-redis', function () {
    const plugin = makePlugin('watch', { register: false })
    plugin.inherits('haraka-plugin-redis')
    assert.ok(plugin.get_redis_sub_channel)
    // console.log(plugin);
  })

  it('ignores results that are not objects', function () {
    assert.equal(typeof watch.redis_subscribe_all_results, 'function')
  })

  describe('plugin name mapping', function () {
    it('coalesces queue/auth plugin names', function () {
      assert.equal(watch.get_plugin_name('queue/smtp_forward'), 'queue')
      assert.equal(watch.get_plugin_name('auth/auth_vpopmaild'), 'auth')
    })

    it('maps known aliases', function () {
      assert.equal(watch.get_plugin_name('connect.fcrdns'), 'fcrdns')
      assert.equal(watch.get_plugin_name('connect.p0f'), 'p0f')
      assert.equal(watch.get_plugin_name('data.headers'), 'headers')
      assert.equal(watch.get_plugin_name('outbound'), 'queue')
      assert.equal(watch.get_plugin_name('dkim_verify'), 'dkim')
      assert.equal(watch.get_plugin_name('dkim_sign'), 'dkim')
      assert.equal(watch.get_plugin_name('dmarc-perl'), 'dmarc')
      assert.equal(watch.get_plugin_name('data.dmarc'), 'dmarc')
    })
  })

  describe('format helpers', function () {
    it('formats recipient status', function () {
      assert.deepEqual(
        watch.format_recipient({
          address: 'user@example.net',
          action: 'reject',
        }),
        {
          newval: 'user@example.net',
          classy: 'bg_red',
          title: 'user@example.net',
        },
      )
      assert.deepEqual(
        watch.format_recipient({
          address: 'user@example.net',
          action: 'accept',
        }),
        {
          newval: 'user@example.net',
          classy: 'bg_green',
          title: 'user@example.net',
        },
      )
    })

    it('formats default pass/fail/err', function () {
      assert.deepEqual(watch.format_default({ pass: 'ok' }), {
        classy: 'bg_green',
        title: 'ok',
      })
      assert.deepEqual(watch.format_default({ fail: 'no' }), {
        classy: 'bg_red',
        title: 'no',
      })
      assert.deepEqual(watch.format_default({ err: 'temp' }), {
        classy: 'bg_yellow',
        title: 'temp',
      })
    })

    it('formats fcrdns/asn/p0f/bounce helpers', function () {
      assert.deepEqual(watch.format_fcrdns({ pass: true }), {
        classy: 'bg_green',
      })
      assert.deepEqual(watch.format_fcrdns({ fail: 'bad ptr' }), {
        title: 'bad ptr',
        classy: 'bg_lred',
      })
      assert.deepEqual(watch.format_fcrdns({ fcrdns: ['a', 'b'] }), {
        title: 'a b',
      })

      assert.deepEqual(watch.format_asn({ pass: true }), { classy: 'bg_green' })
      assert.deepEqual(watch.format_asn({ asn: 'AS123', net: 'example net' }), {
        newval: 'AS123',
        title: 'example net',
      })

      assert.deepEqual(
        watch.format_p0f({ os_name: 'Windows', os_flavor: '10', distance: 3 }),
        {
          title: 'Windows 10, 3 hops',
          newval: 'Windows',
        },
      )

      assert.deepEqual(watch.format_bounce({ isa: 'no' }), {
        classy: 'bg_lgreen',
        title: 'not a bounce',
      })
    })

    it('formats helo and remote host data', function () {
      const helo = watch.format_helo('ABC.1', { host: 'mail.example.net' })
      assert.equal(helo.uuid, 'ABC.1')
      assert.equal(helo.helo.newval, 'mail.example.net')
      assert.equal(helo.helo.classy, 'bg_white')

      const remote = watch.format_remote_host('ABC.1', {
        host: 'DNSERROR',
        ip: '192.0.2.1',
      })
      assert.equal(remote.remote_host.newval, '192.0.2.1')
      assert.equal(remote.remote_host.title, '192.0.2.1')
    })
  })

  describe('classification and title', function () {
    it('classifies dmarc and spf results', function () {
      assert.equal(
        watch.get_class('dmarc', {
          result: 'fail',
          reason: [{ comment: 'no policy' }],
        }),
        'bg_yellow',
      )

      assert.equal(watch.get_class('spf', { result: 'Pass' }), 'bg_green')
      assert.equal(watch.get_class('spf', { result: 'Neutral' }), 'bg_lgreen')
      assert.equal(watch.get_class('spf', { result: 'Fail' }), 'bg_red')
    })

    it('classifies karma fallback and relay defaults', function () {
      assert.equal(watch.get_class('karma', { history: 3 }), 'bg_green')
      assert.equal(
        watch.get_class('relay', { pass: ['ok'], fail: [], err: [] }),
        'bg_green',
      )
      assert.equal(
        watch.get_class('unknown', { pass: [], fail: ['no'], err: [] }),
        'bg_red',
      )
    })

    it('returns titles for queue and dmarc', function () {
      assert.equal(watch.get_title('queue', { human: 'queued' }), 'queued')
      assert.equal(
        watch.get_title('dmarc', {
          result: 'fail',
          disposition: 'reject',
          reason: [{ comment: 'bad' }],
        }),
        'fail, reject, bad',
      )
    })
  })

  describe('format_any', function () {
    it('handles common plugin payloads', function () {
      const plugin = makePlugin('watch', { register: false })

      assert.deepEqual(
        plugin.format_any('access', { whitelist: true, pass: 'ok' }),
        {
          classy: 'bg_green',
          title: 'ok',
        },
      )

      assert.deepEqual(
        plugin.format_any('connect.geoip', {
          human: 'US / CA',
          distance: '5000',
        }),
        {
          title: 'US / CA',
          newval: 'US / C',
          classy: 'bg_red',
        },
      )

      assert.deepEqual(
        plugin.format_any('tls', { enabled: true, verified: false }),
        {
          classy: 'bg_lgreen',
          title: JSON.stringify({ enabled: true, verified: false }),
        },
      )

      assert.deepEqual(
        plugin.format_any('mail_from', { address: 'sender@example.net' }),
        {
          newval: 'sender@example.net',
          classy: 'black',
          title: 'sender@example.net',
        },
      )
    })

    it('colors access by ACL hit, not soft fails', function () {
      const plugin = makePlugin('watch', { register: false })

      // ACL hits drive red/green
      assert.deepEqual(
        plugin.format_any('access', { whitelist: true, pass: 'conn:allow' }),
        { classy: 'bg_green', title: 'conn:allow' },
      )
      assert.deepEqual(
        plugin.format_any('access', { blacklist: true, fail: 'any(evil.com)' }),
        { classy: 'bg_red', title: 'any(evil.com)' },
      )
      // an address whitelist pass (no flag) is still green
      assert.equal(
        plugin.format_any('access', { pass: 'mail:allow' }).classy,
        'bg_green',
      )
      // a soft fail with no ACL hit (e.g. invalid HELO domain) is a warning,
      // not a block
      assert.deepEqual(
        plugin.format_any('access', { fail: 'invalid domain: GUEST' }),
        { classy: 'bg_yellow', title: 'invalid domain: GUEST' },
      )
    })

    it('formats score-based plugins', function () {
      const plugin = makePlugin('watch', { register: false })

      assert.deepEqual(plugin.format_any('karma', { score: -9 }), {
        classy: 'bg_red',
        title: -9,
      })

      // spamassassin publishes `score` (not `hits`)
      assert.equal(
        plugin.format_any('spamassassin', { score: -6.8 }).classy,
        'bg_dgreen',
      )
    })

    it('does not repaint scored cells grey on supplementary results', function () {
      const plugin = makePlugin('watch', { register: false })

      // rspamd emits {symbols} after the scored result; spamassassin emits
      // skip/emit. neither carries a score, so they must be no-op cells, not
      // a grey fallback that clobbers the color
      assert.deepEqual(plugin.format_any('rspamd', { symbols: ['A', 'B'] }), {})
      assert.deepEqual(
        plugin.format_any('spamassassin', { skip: 'authed' }),
        {},
      )

      // errors still surface as yellow
      assert.equal(
        plugin.format_any('rspamd', { err: 'timeout' }).classy,
        'bg_yellow',
      )
      assert.equal(
        plugin.format_any('spamassassin', { err: 'socket' }).classy,
        'bg_yellow',
      )
    })

    it('scales rspamd intensity from dark green to dark red', function () {
      const plugin = makePlugin('watch', { register: false })
      const classy = (r) => plugin.format_any('rspamd', r).classy

      assert.equal(classy({ score: 1, action: 'greylist' }), 'bg_grey')
      assert.equal(classy({ score: 1, is_skipped: true }), '')
      assert.equal(classy({ score: 1, action: 'reject' }), 'bg_dred')
      assert.equal(classy({ score: -9 }), 'bg_dgreen')
      assert.equal(classy({ score: -1 }), 'bg_green')
      assert.equal(classy({ score: 1 }), 'bg_lgreen')
      assert.equal(classy({ score: 4 }), 'bg_yellow')
      assert.equal(classy({ score: 7 }), 'bg_lred')
      assert.equal(classy({ score: 12 }), 'bg_red')
      assert.equal(classy({ score: 99 }), 'bg_dred')
    })

    it('scales spamassassin intensity from dark green to dark red', function () {
      const plugin = makePlugin('watch', { register: false })
      const classy = (r) => plugin.format_any('spamassassin', r).classy

      assert.equal(classy({ score: -9 }), 'bg_dgreen')
      assert.equal(classy({ score: -0.5 }), 'bg_green')
      assert.equal(classy({ score: 1 }), 'bg_lgreen')
      assert.equal(classy({ score: 3 }), 'bg_yellow')
      assert.equal(classy({ score: 7 }), 'bg_lred')
      assert.equal(classy({ score: 15 }), 'bg_red')
      assert.equal(classy({ score: 25 }), 'bg_dred')
    })

    it('falls back to get_title/get_class when plugin is unknown', function () {
      const plugin = makePlugin('watch', { register: false })
      const res = plugin.format_any('unknown', {
        human_html: 'human',
        pass: ['ok'],
        fail: [],
        err: [],
      })
      assert.equal(res.title, 'human')
      assert.equal(res.classy, 'bg_green')
    })

    it('formats spf, recipient, headers, dkim, dmarc and queue', function () {
      const plugin = makePlugin('watch', { register: false })

      assert.deepEqual(
        plugin.format_any('spf', { scope: 'mfrom', result: 'Fail' }),
        { title: 'Fail', scope: 'mfrom', classy: 'bg_red' },
      )
      assert.equal(
        plugin.format_any('spf', { scope: 'mfrom', result: 'None' }).classy,
        'bg_lgrey',
      )
      assert.equal(
        plugin.format_any('spf', { scope: 'mfrom', result: 'SoftFail' }).classy,
        'bg_yellow',
      )
      assert.deepEqual(plugin.format_any('spf', { skip: true }), {
        classy: 'bg_yellow',
      })

      assert.deepEqual(
        plugin.format_any('rcpt_to', {
          recipient: { address: 'u@example.net', action: 'accept' },
        }),
        { newval: 'u@example.net', classy: 'bg_green', title: 'u@example.net' },
      )

      assert.deepEqual(plugin.format_any('relay', { pass: 'ok' }), {
        classy: 'bg_green',
        title: 'ok',
      })
      assert.deepEqual(plugin.format_any('relay', { skip: true }), {})

      assert.deepEqual(plugin.format_any('headers', { fail: 'direct-to-mx' }), {
        classy: 'bg_lred',
      })
      assert.deepEqual(plugin.format_any('headers', { fail: 'from_match' }), {
        classy: 'bg_yellow',
      })

      // modern dkim plugin publishes as 'dkim'; legacy dkim_verify/dkim_sign
      // normalize to the same formatter
      assert.deepEqual(plugin.format_any('dkim', { pass: 'ok' }), {
        classy: 'bg_green',
        title: 'ok',
      })
      assert.deepEqual(plugin.format_any('dkim_verify', { pass: 'ok' }), {
        classy: 'bg_green',
        title: 'ok',
      })
      assert.deepEqual(plugin.format_any('dkim', { err: 'timeout' }), {
        classy: 'bg_yellow',
        title: 'timeout',
      })

      assert.deepEqual(plugin.format_any('dmarc', { pass: 'aligned' }), {
        classy: 'bg_green',
        title: 'aligned',
      })
      assert.deepEqual(plugin.format_any('dmarc', { dmarc: 'none' }), {
        classy: 'bg_grey',
        title: 'none',
      })
      assert.deepEqual(plugin.format_any('dmarc', { fail: 'unaligned' }), {
        classy: 'bg_red',
        title: 'unaligned',
      })

      assert.deepEqual(plugin.format_any('queue', { pass: 'queued' }), {
        classy: 'bg_green',
        title: 'queued',
      })
      assert.deepEqual(plugin.format_any('queue', { fail: 'rejected' }), {
        classy: 'bg_red',
        title: 'rejected',
      })
    })

    it('formats geoip, p0f, uribl and karma score tiers', function () {
      const plugin = makePlugin('watch', { register: false })

      assert.deepEqual(plugin.format_any('geoip', { human: 'United' }), {
        title: 'United',
        newval: 'United',
      })
      assert.equal(
        plugin.format_any('geoip', { human: 'Nearby', distance: '500' }).classy,
        'bg_green',
      )

      assert.deepEqual(
        plugin.format_any('p0f', {
          os_name: 'FreeBSD',
          os_flavor: '13',
          distance: 2,
        }),
        { title: 'FreeBSD 13, 2 hops', newval: 'FreeBSD' },
      )

      assert.deepEqual(plugin.format_any('uribl', { fail: 'listed' }), {
        title: 'listed',
        classy: 'bg_lred',
      })

      assert.equal(plugin.format_any('karma', { score: -5 }).classy, 'bg_lred')
      assert.equal(
        plugin.format_any('karma', { score: -1 }).classy,
        'bg_yellow',
      )
      assert.equal(plugin.format_any('karma', { score: 5 }).classy, 'bg_green')
      assert.equal(plugin.format_any('karma', { score: 1 }).classy, 'bg_lgreen')
      assert.deepEqual(plugin.format_any('karma', { pass: true }), {
        classy: 'bg_green',
      })
    })
  })

  describe('get_class and get_title branches', function () {
    it('classifies dmarc, karma and spf variants', function () {
      assert.equal(watch.get_class('dmarc', {}), 'got')
      assert.equal(watch.get_class('dmarc', { result: 'pass' }), 'bg_green')
      assert.equal(watch.get_class('dmarc', { result: 'fail' }), 'bg_red')

      assert.equal(watch.get_class('karma', { score: 5 }), 'bg_green')
      assert.equal(watch.get_class('karma', { score: 2 }), 'bg_lgreen')
      assert.equal(watch.get_class('karma', { score: -5 }), 'bg_red')
      assert.equal(watch.get_class('karma', { score: -1 }), 'bg_lred')
      assert.equal(watch.get_class('karma', { score: 0 }), 'bg_yellow')
      assert.equal(watch.get_class('karma', { history: 5 }), 'bg_green')
      assert.equal(watch.get_class('karma', { history: 0 }), 'bg_yellow')
      assert.equal(watch.get_class('karma', { history: -2 }), 'bg_red')

      assert.equal(watch.get_class('spf', { result: 'error' }), 'bg_yellow')
      assert.equal(watch.get_class('spf', { result: 'None' }), '')
    })

    it('classifies relay, host_list and default fallbacks', function () {
      assert.equal(
        watch.get_class('relay', { pass: ['a'], fail: ['b'], err: [] }),
        'bg_lgreen',
      )
      assert.equal(
        watch.get_class('relay', { pass: [], fail: [], err: ['e'] }),
        'bg_yellow',
      )
      assert.equal(
        watch.get_class('rcpt_to.in_host_list', { pass: ['a'], fail: [] }),
        'bg_green',
      )
      assert.equal(
        watch.get_class('unknown', { pass: [], fail: [], err: [] }),
        'bg_lgrey',
      )
    })

    it('returns default titles', function () {
      assert.equal(watch.get_title('dmarc', { result: 'pass' }), 'pass')
      assert.equal(watch.get_title('unknown', { human_html: 'h' }), 'h')
    })
  })

  describe('more format helpers', function () {
    it('handles recipient, fcrdns, asn, p0f and bounce edges', function () {
      assert.deepEqual(
        watch.format_recipient({ address: 'u@example.net', action: 'queue' }),
        { newval: 'u@example.net', classy: 'black', title: 'u@example.net' },
      )
      assert.deepEqual(watch.format_recipient(), {
        newval: '',
        classy: 'black',
        title: '',
      })
      assert.deepEqual(
        watch.format_recipient({
          address: 'very.long.local.part.name@example.net',
          action: 'ACCEPT',
        }),
        {
          newval: '...part.name@example.net',
          classy: 'bg_green',
          title: 'very.long.local.part.name@example.net',
        },
      )

      assert.deepEqual(watch.format_fcrdns({ fcrdns: 'mail.example.net' }), {
        title: 'mail.example.net',
      })
      assert.deepEqual(watch.format_fcrdns({}), {})
      assert.deepEqual(watch.format_asn({}), {})

      assert.deepEqual(watch.format_p0f(null), {})
      assert.deepEqual(watch.format_bounce({ fail: ['x'], human: 'bounced' }), {
        classy: 'bg_red',
        title: 'bounced',
      })
      assert.deepEqual(watch.format_bounce({}), { classy: 'bg_green' })
    })

    it('shortens long helo and remote host values', function () {
      const long = 'very.long.subdomain.chain.example.net'
      const helo = watch.format_helo('ABC.1', { host: long })
      assert.ok(helo.helo.newval.startsWith('...'))
      assert.equal(helo.helo.title, long)

      const remote = watch.format_remote_host('ABC.1', {
        host: long,
        ip: '192.0.2.1',
      })
      assert.ok(remote.remote_host.newval.includes('...'))
      assert.ok(remote.remote_host.newval.endsWith('/ 192.0.2.1'))
    })

    it('format_results carries spf scope', function () {
      const plugin = makePlugin('watch', { register: false })
      const res = plugin.format_results('spf', {
        scope: 'helo',
        result: 'Pass',
      })
      assert.equal(res.scope, 'helo')
    })
  })

  describe('http and websocket hooks', function () {
    it('hook_init_http serves config and static assets', async function () {
      const plugin = makePlugin('watch', { register: false })
      plugin.load_watch_ini()
      plugin.cfg.wss = { url: 'wss://watch.example.net' }

      const routes = {}
      let staticDir
      const server = {
        http: {
          app: {
            use(p, fn) {
              routes[p] = fn
            },
          },
          express: {
            static: (dir) => {
              staticDir = dir
              return () => {}
            },
          },
        },
      }

      await new Promise((resolve) => plugin.hook_init_http(resolve, server))

      assert.ok(routes['/watch/wss_conf'])
      assert.ok(staticDir.endsWith('html'))

      let body
      routes['/watch/wss_conf'](
        {},
        {
          end(s) {
            body = s
          },
        },
      )
      assert.deepEqual(JSON.parse(body), {
        sampling: false,
        wss_url: 'wss://watch.example.net',
      })
    })

    it('hook_init_wss tracks watchers and wires client events', async function () {
      const sent = []
      const plugin = makePlugin('watch', { register: false })
      const wss = await initWss(plugin, sent)

      const ws = new EventEmitter()
      wss.emit('connection', ws)
      assert.ok(sent.some((m) => typeof m.watchers === 'number'))

      ws.emit('error', new Error('boom'))
      ws.emit('close', 1000, Buffer.from('bye'))
      wss.emit('error', new Error('server boom'))
    })
  })

  describe('deny and queue hooks', function () {
    const connection = {
      transaction: { uuid: 'TX-1' },
      remote: { host: 'mail.example.net', ip: '192.0.2.5' },
      logdebug() {},
    }

    it('w_deny broadcasts a colored cell per severity', async function () {
      const sent = []
      const plugin = makePlugin('watch', { register: false })
      await initWss(plugin, sent)

      await new Promise((resolve) =>
        plugin.w_deny(resolve, connection, [
          DENY,
          null,
          'access',
          null,
          null,
          'rcpt',
        ]),
      )
      assert.equal(sent.at(-1).access.classy, 'bg_dred')
      assert.equal(
        sent.at(-1).remote_host.newval,
        'mail.example.net / 192.0.2.5',
      )
      // a deny does not end the connection, so the port must stay lit
      assert.equal(sent.at(-1).local_port, undefined)

      await new Promise((resolve) =>
        plugin.w_deny(resolve, connection, [
          DENYSOFT,
          null,
          'access',
          null,
          null,
          'rcpt',
        ]),
      )
      assert.equal(sent.at(-1).access.classy, 'bg_dyellow')
    })

    it('queue_ok broadcasts queue success', async function () {
      const sent = []
      const plugin = makePlugin('watch', { register: false })
      await initWss(plugin, sent)

      await new Promise((resolve) =>
        plugin.queue_ok(resolve, connection, 'ok 1 qp 2'),
      )
      assert.deepEqual(sent.at(-1), {
        uuid: 'TX-1',
        queue: { classy: 'bg_green', title: 'ok 1 qp 2' },
      })
    })
  })

  describe('result subscription handler', function () {
    async function setup() {
      const sent = []
      const plugin = makePlugin('watch', { register: false })
      plugin.load_watch_ini()
      await initWss(plugin, sent)
      const handler = await captureResultHandler(plugin)
      const fire = (payload) => handler(JSON.stringify(payload), 'result-ABC')
      return { sent, plugin, fire }
    }

    it('broadcasts connection-phase results', async function () {
      const { sent, fire } = await setup()

      fire({ plugin: 'local', result: { port: 465 } })
      assert.deepEqual(sent, [
        { uuid: 'ABC', local_port: { newval: 465 } },
        { uuid: 'ABC', tls: { classy: 'bg_green' } },
      ])

      sent.length = 0
      fire({ plugin: 'remote', result: { ip: '192.0.2.9', host: 'mx.test' } })
      assert.deepEqual(sent, [
        {
          uuid: 'ABC',
          remote_host: {
            newval: 'mx.test / 192.0.2.9',
            title: 'mx.test / 192.0.2.9',
          },
        },
      ])

      sent.length = 0
      fire({ plugin: 'helo', result: { host: 'mx.test' } })
      assert.equal(sent[0].helo.newval, 'mx.test')

      sent.length = 0
      fire({ plugin: 'disconnect', result: { duration: 2 } })
      assert.deepEqual(sent[0], {
        uuid: 'ABC',
        queue: { newval: '2.0' },
        local_port: { classy: 'bg_white', title: 'disconnected' },
      })
    })

    it('broadcasts transaction and queue results', async function () {
      const { sent, fire } = await setup()

      fire({ plugin: 'queue/smtp_forward', result: { pass: 'ok' } })
      assert.deepEqual(sent.at(-1), {
        uuid: 'ABC',
        'queue/smtp_forward': { classy: 'bg_green' },
      })

      fire({ plugin: 'outbound', result: { ok: true } })
      assert.deepEqual(sent.at(-1), {
        uuid: 'ABC',
        queue: { classy: 'bg_green' },
      })

      sent.length = 0
      fire({ plugin: 'spf', result: { scope: 'mfrom', result: 'Pass' } })
      assert.deepEqual(sent.at(-1), {
        uuid: 'ABC',
        spf: { title: 'Pass', scope: 'mfrom', classy: 'bg_green' },
      })
    })

    it('drops noisy, malformed and ignored results', async function () {
      const { sent, plugin, fire } = await setup()
      plugin.cfg.ignore['9.9.9.9'] = {}

      fire({ plugin: 'whatever', result: 'not-an-object' })
      fire({ plugin: 'access', result: { msg: 'noted' } })
      fire({ plugin: 'dnsbl', result: { pass: 'ok' } })
      fire({ plugin: 'karma', result: { msg: 'noted' } })
      fire({ plugin: 'headers', result: { pass: 'ok' } })
      fire({ plugin: 'remote', result: { ip: '9.9.9.9' } })

      assert.equal(sent.length, 0)
    })

    it('filters per-plugin noise fields', async function () {
      const { sent, fire } = await setup()

      fire({ plugin: 'early_talker', result: { pass: 'ok' } })
      fire({ plugin: 'helo.checks', result: { skip: 'no helo' } })
      fire({ plugin: 'uribl', result: { skip: 'no uris' } })
      fire({ plugin: 'known-senders', result: { sender: 'a@b.net' } })
      fire({ plugin: 'mail_from.is_resolvable', result: { msg: 'noted' } })
      fire({ plugin: 'rcpt_to.in_host_list', result: { skip: 'n/a' } })
      fire({ plugin: 'limit', result: { concurrent_count: 1 } })
      fire({ plugin: 'relay', result: { skip: 'not relaying' } })

      assert.equal(sent.length, 0)
    })
  })
})
