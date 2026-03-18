'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const fixtures = require('haraka-test-fixtures')
const watch = require('..')

describe('watch', function () {
  it('register', function () {
    const plugin = new fixtures.plugin('watch')
    plugin.server = { notes: {} }
    plugin.register()
    assert.ok(plugin.cfg.main)
    // console.log(plugin.cfg);
  })

  it('loads watch.ini', function () {
    const plugin = new fixtures.plugin('watch')
    plugin.server = { notes: {} }
    plugin.load_watch_ini()
    assert.equal(plugin.cfg.main.sampling, false)
  })

  it('inherits from haraka-plugin-redis', function () {
    const plugin = new fixtures.plugin('watch')
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
      const plugin = new fixtures.plugin('watch')

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

    it('formats score-based plugins', function () {
      const plugin = new fixtures.plugin('watch')

      assert.deepEqual(plugin.format_any('karma', { score: -9 }), {
        classy: 'bg_red',
        title: -9,
      })

      assert.deepEqual(
        plugin.format_any('rspamd', {
          score: 7,
          is_spam: true,
          action: 'reject',
        }),
        {
          classy: 'bg_red',
          title: JSON.stringify({ score: 7, is_spam: true, action: 'reject' }),
        },
      )

      assert.deepEqual(plugin.format_any('spamassassin', { hits: -0.5 }), {
        classy: 'bg_green',
        title: JSON.stringify({ hits: -0.5 }),
      })
    })

    it('falls back to get_title/get_class when plugin is unknown', function () {
      const plugin = new fixtures.plugin('watch')
      const res = plugin.format_any('unknown', {
        human_html: 'human',
        pass: ['ok'],
        fail: [],
        err: [],
      })
      assert.equal(res.title, 'human')
      assert.equal(res.classy, 'bg_green')
    })
  })
})
