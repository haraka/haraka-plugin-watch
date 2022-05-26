
const assert = require('assert');
const fixtures = require('haraka-test-fixtures');

describe('watch', function () {
  it('register', function () {
    const plugin = new fixtures.plugin('watch');
    plugin.server = { notes: {} }
    plugin.register();
    assert.ok(plugin.cfg.main);
    // console.log(plugin.cfg);
  })

  it('loads watch.ini', function () {
    const plugin = new fixtures.plugin('watch');
    plugin.server = { notes: {} }
    plugin.load_watch_ini();
    assert.equal(plugin.cfg.main.sampling, false);
  })

  it('inherits from haraka-plugin-redis', function () {
    const plugin = new fixtures.plugin('watch');
    plugin.inherits('haraka-plugin-redis');
    assert.ok(plugin.get_redis_sub_channel);
    // console.log(plugin);
  })

  it('ignores results that are not objects', function () {
    const plugin = new fixtures.plugin('watch');
    plugin.server = { notes: {} }
    plugin.register();
    plugin.load_redis_ini();

    // TODO
  })

  it.skip('mocks up a wss socket', function () {
  })

  it.skip('mocks up a connection', function () {
  })

  it.skip('saves some results', function () {
  })

  it.skip('sees those results via redis connection subscription', function () {
  })

})
