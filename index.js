'use strict';

var wss = { broadcast: function () {} };
var watchers = 0;

exports.register = function () {
  var plugin = this;

  plugin.inherits('haraka-plugin-redis');

  plugin.load_watch_ini();

  plugin.register_hook('init_master', 'redis_subscribe_all_results');
  plugin.register_hook('init_child',  'redis_subscribe_all_results');

  // [
  //   'lookup_rdns', 'connect', 'helo', 'ehlo', 'mail', 'rcpt', 'rcpt_ok',
  //   'data', 'data_post', 'reset_transaction'
  // ]
  // .forEach(function (hook) {
  //   plugin.register_hook(hook,  'get_incremental_results');
  // });
  // plugin.register_hook('queue_ok',     'queue_ok');
  // plugin.register_hook('deny',         'w_deny');
  // plugin.register_hook('disconnect',   'disconnect');
};

exports.load_watch_ini = function () {
  var plugin = this;
  plugin.cfg = plugin.config.get('watch.ini', {
    booleans:  ['-main.sampling'],
  },
  function () {
    plugin.load_watch_ini();
  });
};

exports.hook_init_http = function (next, server) {
  var plugin = this;

  server.http.app.use('/watch/wss_conf', function (req, res) {
    // app.use args: request, response, app_next
    // pass config information to the WS client
    var client = { sampling: plugin.cfg.main.sampling };
    if (plugin.cfg.wss && plugin.cfg.wss.url) {
      client.wss_url = plugin.cfg.wss.url;
    }
    res.end(JSON.stringify(client));
  });

  var htdocs = __dirname + '/html';
  if (plugin.cfg.wss && plugin.cfg.wss.htdocs) {
    htdocs = plugin.cfg.wss.htdocs;
  }
  server.http.app.use('/watch/', server.http.express.static(htdocs));

  plugin.loginfo('watch init_http done');
  return next();
};

exports.hook_init_wss = function (next, server) {
  var plugin = this;
  plugin.loginfo('watch init_wss');

  wss = server.http.wss;

  wss.on('error', function (error) {
    plugin.loginfo("server error: " + error);
  });

  wss.on('connection', function (ws) {
    watchers++;
    // broadcast updated watcher count
    wss.broadcast({ watchers: watchers });

    // plugin.logdebug("client connected: " + Object.keys(ws));
    //
    // send message to just this websocket
    // ws.send('welcome!');

    ws.on('error', function (error) {
      plugin.logdebug("client error: " + error);
    });

    ws.on('close', function (code, message) {
      plugin.logdebug("client closed: " + message + '('+code+')');
      watchers--;
    });

    ws.on('message', function (message) {
      plugin.logdebug("received from client: " + message);
    });
  });

  wss.broadcast = function (data) {
    var f = JSON.stringify(data);
    for (var i in this.clients) {
      this.clients[i].send(f);
    }
  };

  plugin.loginfo('watch init_wss done');
  return next();
};

exports.redis_subscribe_all_results = function (next) {
  var plugin = this;

  plugin.redis_subscribe_pattern('result-*', function () {
    plugin.redis.on('pmessage', function (pattern, channel, message) {
      var match = /result-([A-F0-9\-\.]+)$/.exec(channel); // uuid
      if (!match) {
        plugin.logerror('pattern: ' + pattern);
      }

      var m = JSON.parse(message);

      switch (m.plugin) {
        case 'local':
          if (m.result.port) {
            wss.broadcast({ uuid: match[1], local_port: { newval: m.result.port }});
            return;
          }
          break;
        case 'remote':
          if (m.result.ip) {
            wss.broadcast(exports.format_remote_host(match[1], m.result));
            return;
          }
          break;
        case 'helo':
          if (m.result.host) {
            wss.broadcast(exports.format_helo(match[1], m.result));
            return;
          }
          break;
        case 'reset':
          if (m.result.duration) {
            wss.broadcast({ uuid: match[1], queue: {
              newval: m.result.duration.toFixed(1)
            }});
            return;
          }
          break;
        case 'disconnect':
          if (m.result.duration) {
            wss.broadcast({
              uuid: match[1],
              queue: { newval: m.result.duration.toFixed(1) },
              local_port: { classy: 'bg_white', title: 'disconnected' },
            });
            return;
          }
          break;
        case 'access':
        case 'tls':
          if (m.result.msg) return;
          break;
        case 'dnsbl':
          if (m.result.emit) return;
          if (m.result.pass) return;
          break;
        case 'early_talker':
        case 'helo.checks':
          if (m.result.pass) return;
          if (m.result.skip) return;
          if (m.result.ips) return;
          if (m.result.multi) return;
          if (m.result.helo_host) return;
          break;
        case 'data.uribl':
          if (m.result.pass) return;
          if (m.result.skip) return;
          break;
        case 'karma':
          if (m.result.awards) return;
          if (m.result.msg) return;
          if (m.result.todo) return;
          if (m.result.emit) return;
          break;
        case 'mail_from.is_resolvable':
          if (m.result.msg) return;
          break;
        case 'known-senders':
          if (m.result.rcpt_ods) return;
          if (m.result.sender) return;
          break;
        case 'rcpt_to.in_host_list':
        case 'rcpt_to.qmail_deliverable':
          if (m.result.msg) return;
          if (m.result.skip) return;
          break;
        case 'limit':
          if (m.result.concurrent_count !== undefined) return;
          if (m.result.rate_rcpt) return;
          if (m.result.rate_rcpt_sender) return;
          if (m.result.concurrent) return;
          if (m.result.rate_conn) return;
          if (m.result.msg) return;
          break;
        case 'relay':
          if (m.result.skip) return;
          break;
        case 'data.headers':
          if (m.result.pass) return;
          if (m.result.msg) return;
          if (m.result.skip) return;
          if (m.result.fail) {
            if (m.result.fail == 'UA') return;
          }
          break;
      }

      var req = { uuid : match[1] };
      req[ plugin.get_plugin_name(m.plugin) ] =
        plugin.format_any(m.plugin, m.result);
      wss.broadcast(req);
    });
    next();
  });
};

exports.get_incremental_results = function (next, connection) {
  var plugin = this;

  plugin.get_connection_results(connection);
  if (connection.transaction) {
    plugin.get_transaction_results(connection.transaction);
  }

  return next();
};

exports.queue_ok = function (next, connection) {
  // queue_ok arguments: next, connection, msg
  // ok 1390590369 qp 634 (F82E2DD5-9238-41DC-BC95-9C3A02716AD2.1)

  this.get_incremental_results(function () {
    wss.broadcast({
      uuid: connection.transaction.uuid,
      queue: { classy: 'bg_green' },
    });
    next();
  },
  connection);
};

exports.w_deny = function (next, connection, params) {
  var plugin = this;
  // this.loginfo(this, params);
  var pi_code   = params[0];  // deny code?
  // var pi_msg    = params[1];  // deny error
  var pi_name   = params[2];  // plugin name
  // var pi_function = params[3];
  // var pi_params   = params[4];
  var pi_hook   = params[5];

  connection.logdebug(this, "watch deny saw: " + pi_name +
            ' deny from ' + pi_hook);

  this.get_connection_results(connection);
  if (connection.transaction) {
    this.get_transaction_results(connection.transaction);
  }

  var req = {
    uuid: connection.transaction ? connection.transaction.uuid
                                     : connection.uuid,
    local_port: { classy: 'bg_white', title: 'disconnected' },
    remote_host:  get_remote_host(connection),
  };

  connection.logdebug(this, "watch sending dark red to "+pi_name);
  var bg_class = pi_code === DENYSOFT ? 'bg_dyellow' : 'bg_dred';
  var report_as = plugin.get_plugin_name(pi_name);
  if (req[report_as]) req[report_as].classy = bg_class;
  if (!req[report_as]) req[report_as] = { classy: bg_class };

  wss.broadcast(req);
  return next();
};

exports.disconnect = function (next, connection) {

  var incrDone = function () {
    wss.broadcast( {
      uuid: connection.uuid,
      local_port: { classy: 'bg_white', title: 'disconnected' },
    });
    next();
  };

  this.get_incremental_results(incrDone, connection);
  // this.redis_unsubscribe(connection);
};

exports.get_connection_results = function (connection) {
  var plugin = this;

  var au = connection.notes.auth_user;

  var req = {
    uuid       : connection.uuid,
    local_port : get_local_port(connection),
    remote_host: get_remote_host(connection),
    // tls        : get_tls(connection),
    auth       : au ? { classy: 'bg_green', title: au } : '',
    relay      : get_relay(connection),
    // helo       : get_helo(connection),
    early      : get_early,
    queue      : { newval: elapsed(connection.start_time, 1) },
  };

  // see if changed since we last sent
  [
    'local_port', 'remote_host', 'tls', 'auth', 'relay', 'helo', 'early'
  ]
  .forEach(function (val) {
    if (JSON.stringify(req[val]) === JSON.stringify(connection[val + '_watch'])) {
      // same as last time, don't send
      delete req[val];
    }
    else {
      // cache, so we can compare on the next run
      connection[val + '_watch'] = JSON.stringify(req[val]);
    }
  });

  var result_store = connection.results.get_all();
  for (var name in result_store) {
    plugin.get_plugin_result(req, result_store, name);
  }

  wss.broadcast(req);
};

exports.get_transaction_results = function (txn) {
  var plugin = this;
  if (!txn) return;

  var req = {
    uuid:  txn.uuid,
    // mail_from: get_mailfrom(txn),
    // rcpt_to: get_recipients(txn),
  };

  var result_store = txn.results.get_all();
  for (var name in result_store) {
    plugin.get_plugin_result(req, result_store, name);
  }

  wss.broadcast(req);
};

exports.get_plugin_name = function (pi_name) {

  // coalesce auth/* and queue/* plugins to 'auth' and 'queue'
  if (/^(queue|auth)\//.test(pi_name)) {
    return pi_name.split('/').shift();
  }

  switch (pi_name) {
    case 'connect.fcrdns':
      return 'fcrdns';
    case 'connect.p0f':
      return 'p0f';
  }

  return pi_name;
};

exports.get_plugin_result = function (req, res, name) {
  var plugin = this;
  if (name[0] === '_') return;  // ignore anything with leading _

  var formatted = plugin.format_results(name, res[name]);
  if (res[name]._watch_saw === JSON.stringify(formatted)) {
    // plugin.loginfo(name + ' skip, same as cached');
    return;  // don't report
  }

  // save to request that gets sent to client
  // plugin.loginfo(name + ' saved to res');
  req[ plugin.get_plugin_name(name) ] = formatted;

  // cache formatted result to avoid sending dups to client
  res[name]._watch_saw = JSON.stringify(formatted);
};

exports.format_any = function (pi_name, r) {
  var plugin = this;

  // title: the value shown in the HTML tooltip
  // classy: color of the square
  switch (pi_name) {
    case 'access':
      if (r.whitelist) {
        return { classy: 'bg_green', title: r.pass }
      }
      break;
    case 'bounce':
      return plugin.format_bounce(r);
    case 'connect.fcrdns':
    case 'fcrdns':
      return plugin.format_fcrdns(r);
    case 'connect.asn':
    case 'asn':
      return plugin.format_asn(r);
    case 'connect.geoip':
    case 'geoip':
      if (r.human) return { title: r.human }
      if (r.distance) {
        if (parseInt(r.distance, 10) > 4000 ) {
          return { classy: 'bg_red' };
        }
        return { classy: 'bg_green' };
      }
      if (r.country) return { newval: r.country };
      return {};
    case 'connect.p0f':
    case 'p0f':
      return plugin.format_p0f(r);
    case 'tls':
      if (r.enabled) {
        if (r.verified) {
          return { classy: 'bg_green', title: JSON.stringify(r) };
        }
        return { classy: 'bg_lgreen', title: JSON.stringify(r) };
      }
      break;
    case 'data.uribl':
    case 'dnsbl':
      if (r.fail) return { title: r.fail, classy: 'bg_lred' };
      break;
    case 'karma':
      if (r.score !== undefined) {
        if (r.score < -8) return { classy: 'bg_red' };
        if (r.score < -3) return { classy: 'bg_lred' };
        if (r.score <  0) return { classy: 'bg_yellow' };
        if (r.score >  3) return { classy: 'bg_green' };
        if (r.score >= 0) return { classy: 'bg_lgreen' };
      }
      if (r.fail) return { title: r.fail };
      if (r.err) return { title: r.err, classy: 'bg_yellow' };
      break;
    case 'mail_from':
      if (r.address) return {
        newval: (r.address && r.address.length > 22) ?
                ('..'+r.address.substring(r.address.length - 22)) : r.address,
        classy: 'black',
        title:  r.address,
      }
      break;
    case 'spf':
      if (r.scope) {
        var res = { title: r.result, scope: r.scope };
        switch (r.result) {
          case 'None':
            res.classy = 'bg_lgrey';
            break;
          case 'Pass':
            res.classy = 'bg_green';
            break;
        }
        return res;
      }
      if (r.skip) return { classy: 'bg_yellow' };
      break;
    case 'recipient':
    case 'rcpt_to':
      if (r.recipient) {
        return exports.format_recipient(r.recipient);
      }
      break;
    case 'auth':
    case 'helo.checks':
    case 'mail_from.is_resolvable':
    case 'rcpt_to.in_host_list':
    case 'rcpt_to.qmail_deliverable':
    case 'avg':
    case 'clamd':
    case 'relay':
    case 'known-senders':
    case 'limit':
      if (r.pass || r.fail) return plugin.format_default(r);
      break;
    case 'data.headers':
      if (r.fail) {
        if (/^direct/.test(r.fail)) return { classy: 'bg_lred' };
        if (/^from_match/.test(r.fail)) return { classy: 'bg_yellow' };
      }
      break;
    case 'dkim_verify':
      if (r.pass || r.fail) {
        return plugin.format_default(r);
      }
      if (r.err) {
        return { classy: 'bg_yellow', title: r.err }
      }
      break;
    case 'rspamd':
      if (r.score !== undefined) return {
        classy: (r.is_spam === true ? 'bg_red'
              : r.action  === 'greylist' ? 'bg_grey'
              : r.is_skipped === true ? ''
              : r.score > 5 ? 'bg_lred'
              : r.score < 0 ? 'bg_green'
              : r.score < 3 ? 'bg_lgreen' : 'bg_yellow'),
        title: JSON.stringify(r),
      }
      break;
    case 'spamassassin':
      if (r.hits !== undefined) {
        var hits = parseFloat(r.hits);
        return {
          classy: hits > 5 ? 'bg_red' :
               hits > 2 ? 'bg_yellow' :
               hits < 0 ? 'bg_green' : 'bg_lgreen',
          title: JSON.stringify(r),
          // title: r.flag + ', ' + hits + ' hits, time: ' + r.time,
        }
      }
      break;
    case 'queue':
      if (r.pass) return { classy: 'bg_green', title: r.pass };
      if (r.fail) return { classy: 'bg_red', title: r.fail };
  }

  plugin.loginfo(pi_name);
  plugin.loginfo(r);

  return {
    title:  plugin.get_title(pi_name, r),
    classy: plugin.get_class(pi_name, r),
  };
};

exports.format_recipient = function (r) {

  var rcpt = (r.address.length > 22)
    ? ('..'+r.address.substring(r.address.length - 22))
    : r.address;

  if (r.action === 'reject') {
    return { newval: rcpt, classy: 'bg_red', title: r.address };
  }
  if (r.action === 'accept') {
    return { newval: rcpt, classy: 'bg_green', title: r.address };
  }

  return { newval: rcpt, classy: 'black', title: r.address };
}

exports.format_default = function (r) {
  if (r.pass) return { classy: 'bg_green', title: r.pass };
  if (r.fail) return { classy: 'bg_red', title: r.fail };
  if (r.err) return { classy: 'bg_yellow', title: r.err };
};

exports.format_fcrdns = function (r) {
  if (r.pass) return { classy: 'bg_green' };
  if (r.fail) return { title: r.fail, classy: 'bg_lred' };
  if (r.fcrdns) {
    if (typeof r.fcrdns === 'string') return { title: r.fcrdns };
    if (Array.isArray(r.fcrdns) && r.fcrdns.length) {
      return { title: r.fcrdns.join(' ') };
    }
  }
  // this.loginfo(r);
  return {};
};

exports.format_asn = function (r) {
  if (r.pass) return { classy: 'bg_green' };
  if (r.fail) return { title: r.fail, classy: 'bg_lred' };
  if (r.asn)  return { newval: r.asn };
  this.loginfo(r);
  return {};
};

exports.format_p0f = function (r) {
  if (!r || !r.os_name) return {};
  var f = {
    title: r.os_name +' '+ r.os_flavor + ', ' + r.distance + ' hops',
    newval: r.os_name,
  };
  if (r.os_name) {
    if (/freebsd|mac|ios/i.test(r.os_name)) r.classy = 'bg_green';
    if (/windows/i.test(r.os_name)) r.classy = 'bg_red';
  }
  return f;
};

exports.format_bounce = function (r) {
  if (!r) return {};
  if (r.isa === 'no') return { classy: 'bg_lgreen', title: 'not a bounce' };
  if (r.fail && r.fail.length)  return { classy: 'bg_red', title: r.human };
  return { classy: 'bg_green' };
}

exports.format_results = function (pi_name, r) {
  var plugin = this;

  var s = {
    title:  plugin.get_title(pi_name, r),
    classy: plugin.get_class(pi_name, r),
  };

  if (pi_name === 'spf') { s.scope = r.scope; }
  return s;
};

exports.format_helo = function (uuid, r) {
  return {
    uuid: uuid,
    helo: {
      newval: (r.host && r.host.length > 22) ? '...'+r.host.substring(r.host.length -22) : r.host,
      title:  r.host,
      classy: 'bg_white',
    },
  }
};

exports.get_class = function (pi_name, r) {
  if (!r.pass) r.pass = [];
  if (!r.fail) r.fail = [];
  if (!r.err) r.err = [];
  switch (pi_name) {
    case 'data.dmarc':
      if (!r.result) return 'got';
      var comment = (r.reason && r.reason.length) ? r.reason[0].comment : '';
      return r.result === 'pass'
        ? 'bg_green' : comment === 'no policy'
        ? 'bg_yellow' : 'bg_red';
    case 'karma':
      if (r.score === undefined) {
        var history = parseFloat(r.history) || 0;
        return history >  2 ? 'bg_green' :
                       history < -1 ? 'bg_red'   : 'bg_yellow';
      }
      var score = parseFloat(r.score) || 0;
      return score > 3  ? 'bg_green'  :
                   score > 0  ? 'bg_lgreen' :
                   score < -3 ? 'bg_red'    :
                   score < 0  ? 'bg_lred'   : 'bg_yellow';
    case 'relay':
      return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' :
                    r.fail.length ? 'bg_red'    :
                    r.err.length  ? 'bg_yellow' : '';
    case 'rcpt_to.in_host_list':
      return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' : '';
    case 'spf':
      return r.result === 'Pass' ? 'bg_green' :
                   r.result === 'Neutral' ? 'bg_lgreen' :
                   /fail/i.test(r.result) ? 'bg_red' :
                   /error/i.test(r.result) ? 'bg_yellow' : '';
    default:
      return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' :
                    r.fail.length ? 'bg_red'    :
                    r.err.length  ? 'bg_yellow' :
                                    'bg_lgrey';
  }
};

exports.get_title = function (pi_name, r) {
  // title: the value shown in the HTML tooltip
  switch (pi_name) {
    case 'data.dmarc':
      var comment = (r.reason && r.reason.length) ?
                           r.reason[0].comment : '';
      return r.result === 'pass' ? r.result :
                    [ r.result, r.disposition, comment ].join(', ');
    case 'queue':
      return r.human;
    default:
      return r.human_html;
  }
};

function get_local_port (connection) {
  if (!connection) return {
    classy: 'bg_white', newval: '25', title: 'disconnected'
  };
  var p = connection.local.port || '25';
  if (!p || isNaN(p)) return {
    classy: 'black', newval: '25', title: 'disconnected'
  };
  return {
    newval: p, classy: 'bg_dgreen', title: 'connected'
  };
}

exports.format_remote_host = function (uuid, r) {
  var host  = r.host || '';
  var ip    = r.ip || '';
  var hostShort = host;

  if (host) {
    switch (host) {
      case 'DNSERROR':
      case 'Unknown':
        host = '';
        break;
    }
    if (host.length > 22) {
      hostShort = '...' + host.substring(host.length-20);
    }
  }

  return {
    uuid: uuid,
    remote_host: {
      newval: host ? (hostShort + ' / ' + ip) : ip,
      title: host ? (host + ' / ' + ip) : ip,
    }
  };
}

function get_remote_host (connection) {
  var host  = connection.remote.host || '';
  var ip    = connection.remote.ip || '';
  var hostShort = host;

  if (host) {
    switch (host) {
      case 'DNSERROR':
      case 'Unknown':
        host = '';
        break;
    }
    if (host.length > 22) {
      hostShort = '...' + host.substring(host.length-20);
    }
  }

  return {
    newval: host ? (hostShort + ' / ' + ip) : ip,
    title: host ? (host + ' / ' + ip) : ip,
  };
}

function get_early (connection) {
  if (!connection) return;
  var early = connection.early_talker;
  return {
    title:  early ? 'yes' : 'no',
    classy: early ? 'bg_red' : 'bg_green',
  };
}

function get_relay (connection) {
  if (!connection.relaying) return { title: 'no'};
  return { title: 'yes', classy: 'bg_green'};
}

function elapsed (start, decimal_places) {
  var diff = (Date.now() - start) / 1000;  // in seconds

  if (decimal_places === undefined) {
    decimal_places = diff > 5 ? 0 : diff > 2 ? 1 : 2;
  }
  else {
    decimal_places = parseInt(decimal_places, 10);
    if (isNaN(decimal_places)) {
      decimal_places = 2;
    }
  }
  return diff.toFixed(decimal_places);
}
