'use strict'

const path = require('node:path')
const redis = require('redis')
const WebSocket = require('ws')

const display = require('./plugins')

let wss = { broadcast() {} }
let watchers = 0

// Background classes a "bad" verdict can carry, least → most severe.
const SEVERITY_RANK = {
  bg_lred: 1,
  bg_red: 2,
  bg_dred: 3,
}

// Default sticky cells when [sticky]cells is absent from watch.ini.
const STICKY_CELLS = new Set(['uribl', 'helo.checks'])

const base_uuid = (uuid) => uuid.replace(/\.\d+$/, '')

// Floor each sticky cell to the worst severity seen on this connection, so a
// later/weaker transaction result can't visually downgrade an earlier verdict.
// State lives on the plugin instance (base uuid → cell → class) and is cleared
// on disconnect.
function stick_severity(plugin, uuid, cells) {
  const store = (plugin.sticky_severity ??= new Map())
  const base = base_uuid(uuid)
  for (const name of plugin.sticky_cells ?? STICKY_CELLS) {
    const cell = cells[name]
    if (!cell?.classy) continue

    let worst = store.get(base)
    const prev = worst?.get(name)
    const rank = SEVERITY_RANK[cell.classy]

    if (!rank) {
      if (prev) cell.classy = prev // unranked class: inherit prior worst
      continue
    }
    if (!prev || rank >= SEVERITY_RANK[prev]) {
      if (!worst) store.set(base, (worst = new Map()))
      worst.set(name, cell.classy)
    } else {
      cell.classy = prev
    }
  }
}

exports.register = function () {
  this.inherits('haraka-plugin-redis')

  this.load_watch_ini()

  this.register_hook('init_master', 'redis_subscribe_all_results')
  this.register_hook('init_child', 'redis_subscribe_all_results')

  this.register_hook('deny', 'w_deny')
  this.register_hook('queue_ok', 'queue_ok')
}

exports.load_watch_ini = function () {
  this.cfg = this.config.get(
    'watch.ini',
    {
      booleans: ['-main.sampling'],
    },
    () => {
      this.load_watch_ini()
    },
  )

  if (this.cfg.ignore === undefined) this.cfg.ignore = {}

  const cells = this.cfg.sticky?.cells
  this.sticky_cells = cells
    ? new Set(
        String(cells)
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      )
    : STICKY_CELLS
}

exports.hook_init_http = function (next, server) {
  server.http.app.use('/watch/wss_conf', (req, res) => {
    // pass config information to the WS client
    const client = { sampling: this.cfg.main.sampling }
    if (this.cfg.wss && this.cfg.wss.url) {
      client.wss_url = this.cfg.wss.url
    }
    res.end(JSON.stringify(client))
  })

  let htdocs = path.join(__dirname, 'html')
  if (this.cfg.wss && this.cfg.wss.htdocs) {
    htdocs = this.cfg.wss.htdocs
  }
  server.http.app.use('/watch/', server.http.express.static(htdocs))

  this.loginfo('watch init_http done')
  next()
}

exports.hook_init_wss = function (next, server) {
  const plugin = this
  plugin.loginfo('watch init_wss')

  wss = server.http.wss

  wss.on('error', (error) => {
    plugin.loginfo(`server error: ${error}`)
  })

  wss.on('connection', (ws) => {
    watchers++

    wss.broadcast({ watchers })

    plugin.logdebug(`wss client connected: ${Object.keys(ws)}`)

    ws.on('error', (error) => {
      plugin.logerror(`client error: ${error}`)
    })

    ws.on('close', (code, message) => {
      plugin.loginfo(`client closed: ${message.toString()} (${code})`)
      watchers--
    })
  })

  wss.broadcast = function broadcast(data) {
    const msg = JSON.stringify(data)
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  }

  plugin.loginfo('watch init_wss done')
  next()
}

exports.w_deny = function (next, connection, params) {
  const pi_code = params[0]
  const pi_name = params[2]
  const pi_hook = params[5]

  connection.logdebug(this, `watch deny saw: ${pi_name} deny from ${pi_hook}`)

  // a deny colors the offending plugin's cell; it does not end the
  // connection, so leave local_port lit until the disconnect result arrives
  const req = {
    uuid: connection.transaction
      ? connection.transaction.uuid
      : connection.uuid,
    remote_host: display.get_remote_host(connection),
  }

  const bg_class = pi_code === DENYSOFT ? 'bg_dyellow' : 'bg_dred'
  const report_as = display.get_plugin_name(pi_name)
  if (req[report_as]) req[report_as].classy = bg_class
  if (!req[report_as]) req[report_as] = { classy: bg_class }
  stick_severity(this, req.uuid, req)

  wss.broadcast(req)
  next()
}

exports.queue_ok = function (next, connection, msg) {
  // required b/c outbound doesn't emit results - 2017-03
  wss.broadcast({
    uuid: connection.transaction.uuid,
    queue: {
      classy: 'bg_green',
      title: msg,
    },
  })
  next()
}

// Connection-phase results update connection-level cells (and may emit several
// broadcasts), so they're handled here rather than via the plugin registry. A
// handler returns true when it consumed the result; false falls through to the
// registry's default rendering.
const phase_handlers = {
  local(uuid, r) {
    if (!r.port) return false
    wss.broadcast({ uuid, local_port: { newval: r.port } })
    if (r.port === 465) wss.broadcast({ uuid, tls: { classy: 'bg_green' } })
    return true
  },
  remote(uuid, r) {
    if (!r.ip) return false
    wss.broadcast(display.format_remote_host(uuid, r))
    return true
  },
  helo(uuid, r) {
    if (!r.host) return false
    wss.broadcast(display.format_helo(uuid, r))
    return true
  },
  reset(uuid, r) {
    if (!r.duration) return false
    wss.broadcast({ uuid, queue: { newval: r.duration.toFixed(1) } })
    return true
  },
  disconnect(uuid, r) {
    if (!r.duration) return false
    this.sticky_severity?.delete(base_uuid(uuid))
    wss.broadcast({
      uuid,
      queue: { newval: r.duration.toFixed(1) },
      local_port: { classy: 'bg_white', title: 'disconnected' },
    })
    return true
  },
  'queue/smtp_forward'(uuid, r) {
    if (r.pass) {
      wss.broadcast({ uuid, 'queue/smtp_forward': { classy: 'bg_green' } })
    }
    return true
  },
  outbound(uuid) {
    wss.broadcast({ uuid, queue: { classy: 'bg_green' } })
    return true
  },
}

exports.redis_subscribe_all_results = async function (next) {
  const plugin = this

  if (this.pubsub) return // already subscribed?

  this.pubsub = redis.createClient(this.redisCfg.pubsub)
  this.pubsub.on('error', (err) => {
    this.logerror(err.message)
  })
  await this.pubsub.connect()

  await this.pubsub.pSubscribe('result-*', (message, channel) => {
    const match = /result-([A-F0-9\-.]+)$/.exec(channel) // uuid
    if (!match) {
      plugin.logerror('pattern: result-*')
      return
    }

    const m = JSON.parse(message)

    if (typeof m.result !== 'object') {
      plugin.logerror(`garbage was published on ${channel}: ${m.result}`)
      return
    }

    if (this.cfg.ignore[m.result.ip] !== undefined) return

    const uuid = match[1]

    const phase = phase_handlers[m.plugin]
    if (phase && phase.call(this, uuid, m.result)) return

    // cross-plugin cells (e.g. karma asn_score -> asn) light up even when the
    // result is dropped for its own cell
    const cells = display.extra_cells(m.plugin, m.result)
    if (!display.should_drop(m.plugin, m.result)) {
      cells[display.get_plugin_name(m.plugin)] = display.format_result(
        m.plugin,
        m.result,
      )
    }
    stick_severity(this, uuid, cells)

    if (Object.keys(cells).length) wss.broadcast({ uuid, ...cells })
  })

  this.logdebug(this, `pSubscribed to result-*`)
  next()
}

// re-exported from the display registry for tests and backward compatibility
exports.get_plugin_name = display.get_plugin_name
exports.format_any = display.format_result
exports.format_result = display.format_result
exports.format_recipient = display.format_recipient
exports.format_default = display.format_default
exports.format_fcrdns = display.format_fcrdns
exports.format_asn = display.format_asn
exports.format_p0f = display.format_p0f
exports.format_bounce = display.format_bounce
exports.format_helo = display.format_helo
exports.format_remote_host = display.format_remote_host
exports.format_results = display.format_results
exports.get_class = display.get_class
exports.get_title = display.get_title
