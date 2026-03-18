'use strict'

// Application state
const state = {
  ws: null,
  connect_cols: 0,
  helo_cols: 0,
  mail_from_cols: 0,
  rcpt_to_cols: 0,
  data_cols: 0,
  total_cols: 0,
  cxn_cols: 0,
  txn_cols: 0,
  last_insert: 0,
  rows_showing: 0,
  reconnect_timer: null,
}

const connect_plugins = ['geoip', 'asn', 'p0f', 'dns-list', 'access', 'fcrdns']
const helo_plugins = ['helo.checks', 'tls', 'auth', 'relay', 'spf']
const mail_from_plugins = ['spf', 'mail_from.is_resolvable', 'known-senders']
const rcpt_to_plugins = [
  'queue/smtp_forward',
  'rcpt_to.in_host_list',
  'qmail-deliverable',
]
const data_plugins = [
  'early_talker',
  'bounce',
  'headers',
  'karma',
  'spamassassin',
  'rspamd',
  'clamd',
  'uribl',
  'limit',
  'dkim',
  'attachment',
]
// 'seen' plugins are ones we've seen data reported for. When data from a new
// plugin arrives, it gets added to one of the sections above and the table is
// redrawn.
const seen_plugins = connect_plugins.concat(
  helo_plugins,
  mail_from_plugins,
  rcpt_to_plugins,
  data_plugins,
)
const ignore_seen = [
  'local_port',
  'remote_host',
  'helo',
  'mail_from',
  'rcpt_to',
  'queue',
]

function newRowConnectRow1(data, uuid, txnId) {
  const host = data.remote_host ?? { title: '', newval: '' }
  const port = data.local_port?.newval || '25'

  if (txnId > 1) {
    return [
      `<tr class="${uuid}">`,
      `<td rowspan=2 class="uuid got uuid_tiny" title="">${txnId}</td>`,
      `<td rowspan=2 colspan="${state.cxn_cols}"></td>`,
    ]
  }

  return [
    `<tr class="spacer"><td colspan="${state.total_cols}"></td></tr>`,
    `<tr class="${uuid}">`,
    `<td class="uuid uuid_tiny got" rowspan=2 title="${data.uuid}"><a href="/logs/${data.uuid}" target="_blank" rel="noopener noreferrer">${data.uuid}</a></td>`,
    `<td class="remote_host got" colspan="${state.connect_cols - 1}" title="${host.title}">${host.newval}</td>`,
    `<td class="local_port bg_dgreen" title="connected">${port}</td>`,
    `<td class="helo lgrey" colspan="${state.helo_cols}"></td>`,
  ]
}

function newRowConnectRow2(data, uuid, txnId) {
  if (txnId > 1) return ''

  const res = []
  for (const plugin of connect_plugins) {
    let nv = shortenPlugin(plugin)
    let newc = ''
    let tit = ''
    if (data[plugin]) {
      // not always updated
      if (data[plugin].classy) newc = data[plugin].classy
      if (data[plugin].newval) nv = data[plugin].newval
      if (data[plugin].title) tit = data[plugin].title
    }
    res.push(`<td class="${cssSafe(plugin)} ${newc}" title="${tit}">${nv}</td>`)
  }
  return res.join('')
}

function newRowHelo(data, uuid, txnId) {
  if (txnId > 1) return ''

  const cols = []
  for (const plugin of helo_plugins) {
    cols.push(`<td class=${cssSafe(plugin)}>${shortenPlugin(plugin)}</td>`)
  }
  return cols.join('\n')
}

function newRow(data, uuid) {
  const txnId = uuid.split('_').pop()
  const rowResult = newRowConnectRow1(data, uuid, txnId)

  rowResult.push(
    `<td class="mail_from" colspan=${state.mail_from_cols}></td>`,
    `<td class="rcpt_to" colspan=${state.rcpt_to_cols}></td>`,
  )
  for (const plugin of data_plugins.slice(0, state.data_cols)) {
    rowResult.push(`<td class=${cssSafe(plugin)}>${shortenPlugin(plugin)}</td>`)
  }

  rowResult.push(
    '<td class=queue title="not queued" rowspan=2></td></tr>',
    `<tr class="${uuid}">`,
  )

  rowResult.push(newRowConnectRow2(data, uuid, txnId))
  rowResult.push(newRowHelo(data, uuid, txnId))

  // transaction data
  for (const plugin of mail_from_plugins) {
    rowResult.push(`<td class=${cssSafe(plugin)}>${shortenPlugin(plugin)}</td>`)
  }
  for (const plugin of rcpt_to_plugins) {
    rowResult.push(`<td class=${cssSafe(plugin)}>${shortenPlugin(plugin)}</td>`)
  }
  for (let index = state.data_cols; index < data_plugins.length; index++) {
    const plugin = data_plugins[index]
    rowResult.push(`<td class=${cssSafe(plugin)}>${shortenPlugin(plugin)}</td>`)
  }
  rowResult.push('</tr>')

  if (txnId > 1) {
    const prevUuid = `${uuid.split('_').slice(0, 2).join('_')}_${txnId - 1}`
    const lastRow = $(`#connections > tbody > tr.${prevUuid}`).last()
    if (lastRow) {
      lastRow
        .hide()
        .after($(rowResult.join('\n')))
        .fadeIn('slow')
    }
  } else {
    $(rowResult.join('\n'))
      .hide()
      .prependTo('table#connections > tbody')
      .fadeIn(800)
  }

  const tooltipPlugins = connect_plugins.concat(['remote_host', 'local_port'])
  for (const plugin of tooltipPlugins) {
    $(`table#connections > tbody > tr.${uuid}> td.${cssSafe(plugin)}`).tipsy()
  }
}

function updateRow(row_data, selector) {
  // each bit of data in the WSS sent object represents a TD in the table
  for (const [td_name, td] of Object.entries(row_data)) {
    if (typeof td !== 'object') continue

    const td_name_css = cssSafe(td_name)
    let td_sel = `${selector} > td.${td_name_css}`

    if (td_name === 'spf') {
      if (td.scope === 'helo') {
        td_sel = `${td_sel}:first`
      } else {
        td_sel = `${td_sel}:last`
      }
    }

    updateSeen(td_name)

    if (td.classy) {
      $(td_sel)
        .attr('class', td_name_css) // reset class
        .addClass(td.classy)
        .tipsy()
    }
    if (td.title) {
      $(td_sel)
        .attr('title', `${$(td_sel).attr('title') || ''} ${td.title}`)
        .tipsy()
    }
    if (td.newval) $(td_sel).html(td.newval).tipsy()
  }
  $(`${selector} > td`).tipsy()
}

async function getConfigAndConnect() {
  let config

  if (state.reconnect_timer) {
    clearTimeout(state.reconnect_timer)
    state.reconnect_timer = null
  }

  try {
    config = await fetchJSON(`${window.location.origin}/watch/wss_conf`)
  } catch (err) {
    $('span#connect_state').removeClass().addClass('red')
    $('#messages').append(`config error: ${err.message} `)
    reconnectWebSocket()
    return
  }

  if (!config?.wss_url) {
    config.wss_url = `wss://${window.location.hostname}`
    if (window.location.port) config.wss_url += `:${window.location.port}`
  }
  state.ws = new WebSocket(config.wss_url)

  state.ws.onopen = function () {
    $('span#connect_state').removeClass().addClass('green')

    if (config.sampling) {
      $('#messages').append('sampling')
    }
  }

  state.ws.onerror = function (err) {
    $('#messages').append(`${err}, ${err.message}`)
  }

  state.ws.onclose = function () {
    $('span#connect_state').removeClass().addClass('red')
    reconnectWebSocket()
  }

  state.ws.onmessage = function (event) {
    const data = JSON.parse(event.data)

    if (data.msg) {
      $('#messages').append(`${data.msg} `)
      return
    }

    if (data.watchers) {
      $('span#watchers').html(data.watchers)
      return
    }

    if (data.uuid === undefined) {
      $('#messages').append(' ERROR, no uuid: ')
      return
    }

    const css_valid_uuid = getCssSafeUuid(data.uuid)
    const selector = `table#connections > tbody > tr.${css_valid_uuid}`

    if ($(selector).length) {
      // if the row exists
      updateRow(data, selector)
      return
    }

    const now = Date.now()

    // row doesn't exist (yet)
    if (config.sampling) {
      if (now - state.last_insert < 1000) {
        return
      }
    }

    // time to send a new row
    newRow(data, css_valid_uuid)
    pruneTable()
    state.last_insert = now
  }
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

function reconnectWebSocket() {
  if (state.reconnect_timer) return

  state.reconnect_timer = setTimeout(() => {
    state.reconnect_timer = null
    getConfigAndConnect()
  }, 3000)
}

function updateSeen(plugin) {
  if (seen_plugins.includes(plugin)) return
  if (ignore_seen.includes(plugin)) return

  seen_plugins.push(plugin)

  let bits = plugin.split('.')
  if (bits.length === 2) {
    switch (
      bits[0] // phase prefix
    ) {
      case 'connect':
        connect_plugins.push(plugin)
        break
      case 'helo':
        helo_plugins.push(plugin)
        break
      case 'mail_from':
        mail_from_plugins.push(plugin)
        break
      case 'rcpt_to':
        rcpt_to_plugins.push(plugin)
        break
      case 'data':
        data_plugins.push(plugin)
        break
    }
    $('#messages').append(`, refresh(${plugin}) `)
    return resetTable()
  }

  bits = plugin.split('/')
  if (bits.length === 2) {
    switch (bits[0]) {
      case 'auth': // gets coalesced under the 'HELO auth' box
        return
    }
  }

  $('#messages').append(`, uncategorized(${plugin}) `)
  data_plugins.push(plugin)
  resetTable()
}

function pruneTable() {
  state.rows_showing++
  const max = 200
  if (state.rows_showing < max) return
  $(`table#connections > tbody > tr:gt(${max * 3})`).fadeOut(2000, () => {
    $(this).remove()
  })
  state.rows_showing = $('table#connections > tbody > tr').length
}

function resetTable() {
  // after results for a 'new' plugin that we've never seen arrives, remove
  // the old rows so the table formatting isn't b0rked
  $('table#connections > tbody > tr').fadeOut(5000, () => {
    $(this).remove()
  })
  countCols()
  displayHeaders()
}

function displayHeaders() {
  $('table#connections > thead > tr#labels')
    .html(
      [
        '<th id=id>ID</th>',
        `<th id=connect   colspan=${state.connect_cols} title="Characteristics of Remote Host">CONNECT</th>`,
        `<th id=ehlo      colspan=${state.helo_cols} title="RFC5321.EHLO/HELO">HELO</th>`,
        `<th id=mail_from colspan=${state.mail_from_cols} title="Envelope FROM / Envelope Sender / RFC5321.MailFrom / Return-Path / Reverse-PATH">MAIL FROM</th>`,
        `<th id=rcpt_to   colspan=${state.rcpt_to_cols} title="Envelope Recipient / RFC5321.RcptTo / Forward Path">RCPT TO</th>`,
        `<th id=data      colspan=${state.data_cols} title="DATA, the message content, comprised of the headers and body).">DATA</th>`,
        '<th id=queue title="When a message is accepted, it is delivered into the local mail queue.">QUEUE</th>',
      ].join('\n\t'),
    )
    .tipsy()
  $('table#connections > thead > tr#labels > th').tipsy()
  $('table#connections > tfoot > tr#helptext').html(
    `<td colspan=${state.total_cols}>For a good time: <a href="telnet://${window.location.hostname}:587">nc ${window.location.hostname} 587</a></td>`,
  )
}

function countCols() {
  state.connect_cols = connect_plugins.length
  state.helo_cols = helo_plugins.length
  state.mail_from_cols = mail_from_plugins.length
  state.rcpt_to_cols = rcpt_to_plugins.length
  state.data_cols = Math.ceil(data_plugins.length / 2)
  state.cxn_cols = state.connect_cols + state.helo_cols
  state.txn_cols = state.mail_from_cols + state.rcpt_to_cols + state.data_cols
  state.total_cols = state.cxn_cols + state.txn_cols + 3
}

function cssSafe(str) {
  return str.replace(/([^0-9a-zA-Z\-_])/g, '_')
  // http://www.w3.org/TR/CSS21/syndata.html#characters
  // identifiers can contain only [a-zA-Z0-9] <snip> plus - and _
}

function shortenPlugin(name) {
  const trims = {
    spamassassin: 'spam',
    early_talker: 'early',
    'rcpt_to.qmail_deliverable': 'qmd',
    'qmail-deliverable': 'qmd',
    'rcpt_to.in_host_list': 'host_list',
    'mail_from.is_resolvable': 'dns',
    'known-senders': 'known',
    'queue/smtp_forward': 'forward',
    smtp_forward: 'forward',
    attachment: 'attach',
  }

  if (trims[name]) return trims[name]

  const parts = name.split('.')

  switch (parts[0]) {
    case 'helo':
    case 'connect':
    case 'mail_from':
    case 'rcpt_to':
    case 'data':
    case 'queue':
      return parts.slice(1).join('.')
  }

  return name
}

function getCssSafeUuid(uuid) {
  // UUID formats
  // CAF2B05E-5382-4E65-A51E-7DEE6EF31F80    // bits.length=1
  // CAF2B05E-5382-4E65-A51E-7DEE6EF31F80.1  // bits.length=2
  // CAF2B05E-5382-4E65-A51E-7DEE6EF31F80.2

  const bits = uuid.split('.')
  if (bits.length === 1) {
    bits[1] = 1
  }

  return `aa_${bits[0].replace(/[_-]/g, '')}_${bits[1]}`
}

countCols()
