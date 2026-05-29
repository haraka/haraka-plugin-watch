'use strict'

// Per-plugin display registry. Each entry describes how a published result is
// rendered as a dashboard cell:
//   drop   - result keys whose presence means "noise, don't redraw"
//   quiet  - predicate for conditional noise suppression
//   format - (result) => cell | undefined; undefined falls back to the
//            generic get_title/get_class classifier in format_result()
//
// Connection-phase results (local/remote/helo/reset/disconnect/queue) are not
// here; they update connection-level cells and are handled in index.js.

// Color ramp, hammy (dark green) to spammy (dark red). Score-based plugins use
// it so intensity tracks the score instead of collapsing into a few buckets.
function ramp_class(value, bands) {
  for (const [below, cls] of bands) {
    if (value < below) return cls
  }
}

const spamassassin_ramp = [
  [-5, 'bg_dgreen'],
  [0, 'bg_green'],
  [2, 'bg_lgreen'],
  [5, 'bg_yellow'],
  [10, 'bg_lred'],
  [20, 'bg_red'],
  [Infinity, 'bg_dred'],
]

const rspamd_ramp = [
  [-5, 'bg_dgreen'],
  [0, 'bg_green'],
  [3, 'bg_lgreen'],
  [6, 'bg_yellow'],
  [10, 'bg_lred'],
  [15, 'bg_red'],
  [Infinity, 'bg_dred'],
]

function shorten(value) {
  if (typeof value !== 'string' || value.length <= 22) return value
  return `..${value.slice(-22)}`
}

exports.get_plugin_name = function (pi_name) {
  // coalesce auth/* and queue/* plugins to 'auth' and 'queue'
  if (/^(queue|auth)\//.test(pi_name)) return pi_name.split('/').shift()

  switch (pi_name) {
    case 'connect.fcrdns':
      return 'fcrdns'
    case 'connect.asn':
      return 'asn'
    case 'connect.geoip':
      return 'geoip'
    case 'connect.p0f':
      return 'p0f'
    case 'data.uribl':
      return 'uribl'
    case 'dkim_verify':
    case 'dkim_sign':
      return 'dkim'
    case 'dmarc-perl':
    case 'data.dmarc':
      return 'dmarc'
    case 'data.headers':
      return 'headers'
    case 'outbound':
      return 'queue'
  }

  return pi_name
}

exports.format_recipient = function (r = {}) {
  const address = typeof r.address === 'string' ? r.address : ''
  const action = typeof r.action === 'string' ? r.action.toLowerCase() : ''
  const action_class = {
    reject: 'bg_red',
    accept: 'bg_green',
  }

  return {
    newval: shorten(address),
    classy: action_class[action] || 'black',
    title: address,
  }
}

exports.format_default = function (r) {
  if (r.pass) return { classy: 'bg_green', title: r.pass }
  if (r.fail) return { classy: 'bg_red', title: r.fail }
  if (r.err) return { classy: 'bg_yellow', title: r.err }
}

exports.format_fcrdns = function (r) {
  if (r.pass) return { classy: 'bg_green' }
  if (r.fail) return { title: r.fail, classy: 'bg_lred' }
  if (r.fcrdns) {
    if (typeof r.fcrdns === 'string') return { title: r.fcrdns }
    if (Array.isArray(r.fcrdns) && r.fcrdns.length) {
      return { title: r.fcrdns.join(' ') }
    }
  }
  return {}
}

exports.format_asn = function (r) {
  if (r.pass) return { classy: 'bg_green' }
  if (r.fail) return { title: r.fail, classy: 'bg_lred' }
  if (r.asn) return { newval: r.asn, title: r.net }
  return {}
}

exports.format_p0f = function (r) {
  if (!r || !r.os_name) return {}
  const f = {
    title: `${r.os_name} ${r.os_flavor}, ${r.distance} hops`,
    newval: r.os_name,
  }
  if (/freebsd|mac|ios/i.test(r.os_name)) r.classy = 'bg_green'
  if (/windows/i.test(r.os_name)) r.classy = 'bg_red'
  return f
}

exports.format_bounce = function (r) {
  if (!r) return {}
  if (r.isa === 'no') return { classy: 'bg_lgreen', title: 'not a bounce' }
  if (r.fail && r.fail.length) return { classy: 'bg_red', title: r.human }
  return { classy: 'bg_green' }
}

exports.format_helo = function (uuid, r) {
  const host = r.host || ''
  return {
    uuid,
    helo: {
      newval: host.length > 22 ? `...${host.slice(-22)}` : host,
      title: r.host,
      classy: 'bg_white',
    },
  }
}

function pass_fail_class(r, none) {
  if (r.pass.length && r.fail.length === 0) return 'bg_green'
  if (r.pass.length) return 'bg_lgreen'
  if (r.fail.length) return 'bg_red'
  if (r.err.length) return 'bg_yellow'
  return none
}

function host_list_class(r) {
  if (r.pass.length && r.fail.length === 0) return 'bg_green'
  if (r.pass.length) return 'bg_lgreen'
  return ''
}

function karma_class(r) {
  if (r.score === undefined) {
    const history = parseFloat(r.history) || 0
    if (history > 2) return 'bg_green'
    if (history < -1) return 'bg_red'
    return 'bg_yellow'
  }
  const score = parseFloat(r.score) || 0
  if (score > 3) return 'bg_green'
  if (score > 0) return 'bg_lgreen'
  if (score < -3) return 'bg_red'
  if (score < 0) return 'bg_lred'
  return 'bg_yellow'
}

function dmarc_class(r) {
  if (!r.result) return 'got'
  const comment = r.reason && r.reason.length ? r.reason[0].comment : ''
  if (r.result === 'pass') return 'bg_green'
  if (comment === 'no policy') return 'bg_yellow'
  return 'bg_red'
}

function spf_class(r) {
  if (r.result === 'Pass') return 'bg_green'
  if (r.result === 'Neutral') return 'bg_lgreen'
  if (/fail/i.test(r.result)) return 'bg_red'
  if (/error/i.test(r.result)) return 'bg_yellow'
  return ''
}

exports.get_class = function (pi_name, r) {
  if (!r.pass) r.pass = []
  if (!r.fail) r.fail = []
  if (!r.err) r.err = []

  switch (pi_name) {
    case 'dmarc':
    case 'dmarc-perl':
    case 'data.dmarc':
      return dmarc_class(r)
    case 'karma':
      return karma_class(r)
    case 'relay':
      return pass_fail_class(r, '')
    case 'rcpt_to.in_host_list':
      return host_list_class(r)
    case 'spf':
      return spf_class(r)
    default:
      return pass_fail_class(r, 'bg_lgrey')
  }
}

exports.get_title = function (pi_name, r) {
  // title: the value shown in the HTML tooltip
  switch (pi_name) {
    case 'dmarc':
    case 'dmarc-perl':
    case 'data.dmarc': {
      const comment = r.reason && r.reason.length ? r.reason[0].comment : ''
      return r.result === 'pass'
        ? r.result
        : [r.result, r.disposition, comment].join(', ')
    }
    case 'queue':
      return r.human
    default:
      return r.human_html
  }
}

exports.format_results = function (pi_name, r) {
  const s = {
    title: exports.get_title(pi_name, r),
    classy: exports.get_class(pi_name, r),
  }

  if (pi_name === 'spf') {
    s.scope = r.scope
  }
  return s
}

exports.format_remote_host = function (uuid, r) {
  const host = r.host || ''
  const ip = r.ip || ''
  const hostShort = normalize_host(host)

  return {
    uuid,
    remote_host: {
      newval: hostShort ? `${hostShort} / ${ip}` : ip,
      title: hostShort ? `${hostShort} / ${ip}` : ip,
    },
  }
}

function normalize_host(host) {
  if (host === 'DNSERROR' || host === 'Unknown') return ''
  if (host.length > 22) return `...${host.substring(host.length - 20)}`
  return host
}

exports.get_remote_host = function (connection) {
  let host = ''
  let ip = ''
  if (connection.remote) {
    if (connection.remote.host) host = connection.remote.host
    if (connection.remote.ip) ip = connection.remote.ip
  }

  const hostShort = normalize_host(host)

  return {
    newval: hostShort ? `${hostShort} / ${ip}` : ip,
    title: hostShort ? `${hostShort} / ${ip}` : ip,
  }
}

function pass_fail(r) {
  if (r.pass || r.fail) return exports.format_default(r)
  if (r.skip) return {}
}

function format_access(r) {
  // an ACL hit drives the color: whitelist allows (green), blacklist blocks
  // (red). a bare fail with no ACL hit (e.g. invalid HELO domain) is a soft
  // warning, not a block. blacklist denials also get dark red from w_deny.
  if (r.whitelist) return { classy: 'bg_green', title: r.pass }
  if (r.blacklist) return { classy: 'bg_red', title: r.fail }
  if (r.fail) return { classy: 'bg_yellow', title: r.fail }
  if (r.pass) return { classy: 'bg_green', title: r.pass }
  if (r.skip) return {}
}

function format_tls(r) {
  if (!r.enabled) return
  return {
    classy: r.verified ? 'bg_green' : 'bg_lgreen',
    title: JSON.stringify(r),
  }
}

function format_list(r) {
  if (r.fail) return { title: r.fail, classy: 'bg_lred' }
}

function format_geoip(r) {
  const f = {}
  if (r.human) {
    f.title = r.human
    f.newval = r.human.substring(0, 6)
  }
  if (r.distance) {
    f.classy = parseInt(r.distance, 10) > 4000 ? 'bg_red' : 'bg_green'
  }
  return f
}

function format_karma(r) {
  if (r.score !== undefined) {
    if (r.score < -8) return { classy: 'bg_red', title: r.score }
    if (r.score < -3) return { classy: 'bg_lred', title: r.score }
    if (r.score < 0) return { classy: 'bg_yellow', title: r.score }
    if (r.score > 3) return { classy: 'bg_green', title: r.score }
    if (r.score >= 0) return { classy: 'bg_lgreen', title: r.score }
  }
  if (r.fail) return { title: r.fail }
  if (r.err) return { title: r.err, classy: 'bg_yellow' }
  if (r.emit) return {}
  if (r.pass) return { classy: 'bg_green' }
}

function format_mail_from(r) {
  if (!r.address) return
  return { newval: shorten(r.address), classy: 'black', title: r.address }
}

function format_spf(r) {
  if (r.scope) {
    const res = { title: r.result, scope: r.scope }
    switch (r.result) {
      case 'None':
        res.classy = 'bg_lgrey'
        break
      case 'Pass':
        res.classy = 'bg_green'
        break
      case 'Fail':
        res.classy = 'bg_red'
        break
      case 'SoftFail':
        res.classy = 'bg_yellow'
        break
    }
    return res
  }
  if (r.skip) return { classy: 'bg_yellow' }
}

function format_recipient_result(r) {
  if (r.recipient) return exports.format_recipient(r.recipient)
}

function format_headers(r) {
  if (r.fail) {
    if (/^direct/.test(r.fail)) return { classy: 'bg_lred' }
    if (/^from_match/.test(r.fail)) return { classy: 'bg_yellow' }
  }
}

function format_dkim(r) {
  if (r.pass || r.fail) return exports.format_default(r)
  if (r.err) return { classy: 'bg_yellow', title: r.err }
}

function format_rspamd(r) {
  if (r.score !== undefined) {
    let classy
    if (r.is_skipped === true) classy = ''
    else if (r.action === 'greylist') classy = 'bg_grey'
    else if (r.action === 'reject') classy = 'bg_dred'
    else classy = ramp_class(parseFloat(r.score), rspamd_ramp)
    return { classy, title: JSON.stringify(r) }
  }
  if (r.err) return { classy: 'bg_yellow', title: r.err }
  // supplementary results (symbols, etc.) must not repaint the scored cell
  return {}
}

function format_spamassassin(r) {
  const score = r.score ?? r.hits
  if (score !== undefined) {
    return {
      classy: ramp_class(parseFloat(score), spamassassin_ramp),
      title: JSON.stringify(r),
    }
  }
  if (r.err) return { classy: 'bg_yellow', title: r.err }
  // skip/emit and other supplementary results leave the cell unchanged
  return {}
}

function format_dmarc(r) {
  if (r.pass) return { classy: 'bg_green', title: r.pass }
  if (r.fail) return { classy: 'bg_red', title: r.fail }
  if (r.dmarc === 'none') return { classy: 'bg_grey', title: r.dmarc }
  if (r.dmarc === 'other') return {}
}

function format_queue(r) {
  if (r.pass) return { classy: 'bg_green', title: r.pass }
  if (r.fail) return { classy: 'bg_red', title: r.fail }
  if (r.msg === '') return {}
}

const noise_text = ['pass', 'skip', 'ips', 'multi', 'helo_host']

const registry = {
  access: { drop: ['msg'], format: format_access },
  tls: { drop: ['msg'], format: format_tls },
  dnsbl: { drop: ['emit', 'pass'], format: format_list },
  'dns-list': { drop: ['emit', 'pass'], format: format_list },
  uribl: { drop: ['pass', 'skip'], format: format_list },
  early_talker: { drop: noise_text, format: pass_fail },
  'helo.checks': { drop: noise_text, format: pass_fail },
  karma: { drop: ['awards', 'msg', 'todo'], format: format_karma },
  'mail_from.is_resolvable': { drop: ['msg'], format: pass_fail },
  'known-senders': { drop: ['rcpt_ods', 'sender'], format: pass_fail },
  'rcpt_to.in_host_list': { drop: ['msg', 'skip'], format: pass_fail },
  'rcpt_to.qmail_deliverable': { drop: ['msg', 'skip'], format: pass_fail },
  'qmail-deliverable': { drop: ['msg', 'skip'], format: pass_fail },
  limit: {
    drop: [
      'concurrent_count',
      'rate_rcpt',
      'rate_rcpt_sender',
      'concurrent',
      'rate_conn',
      'msg',
    ],
    format: pass_fail,
  },
  relay: { drop: ['skip'], format: pass_fail },
  headers: {
    drop: ['pass', 'msg', 'skip'],
    quiet: (r) => r.fail === 'UA',
    format: format_headers,
  },

  auth: { format: pass_fail },
  avg: { format: pass_fail },
  clamd: { format: pass_fail },
  bounce: { format: exports.format_bounce },
  fcrdns: { format: exports.format_fcrdns },
  asn: { format: exports.format_asn },
  geoip: { format: format_geoip },
  p0f: { format: exports.format_p0f },
  mail_from: { format: format_mail_from },
  spf: { format: format_spf },
  recipient: { format: format_recipient_result },
  rcpt_to: { format: format_recipient_result },
  dkim: { format: format_dkim },
  rspamd: { format: format_rspamd },
  spamassassin: { format: format_spamassassin },
  dmarc: { format: format_dmarc },
  queue: { format: format_queue },
}

exports.registry = registry

exports.should_drop = function (pi_name, r) {
  const entry = registry[exports.get_plugin_name(pi_name)]
  if (!entry) return false
  if (entry.quiet && entry.quiet(r)) return true
  if (entry.drop) {
    for (const key of entry.drop) {
      if (r[key] !== undefined) return true
    }
  }
  return false
}

exports.format_result = function (pi_name, r) {
  const name = exports.get_plugin_name(pi_name)
  const entry = registry[name]
  const cell = entry?.format ? entry.format(r) : undefined
  return (
    cell ?? {
      title: exports.get_title(name, r),
      classy: exports.get_class(name, r),
    }
  )
}
