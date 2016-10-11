
var assert = require('assert');
var fixtures = require('haraka-test-fixtures');

describe('watch', function () {
  it('register', function (done) {
    var plugin = new fixtures.plugin('watch');
    plugin.register();
    assert.ok(plugin.cfg.main);
    // console.log(plugin.cfg);
    done();
  });

  it('loads watch.ini', function (done) {
    var plugin = new fixtures.plugin('watch');
    plugin.load_watch_ini();
    assert.equal(plugin.cfg.main.sampling, false);
    done();
  });

  it.skip('mocks up a wss socket', function (done) {
    done();
  });

  it.skip('inherits from haraka-plugin-redis', function (done) {
    done();
  });

  it.skip('mocks up a connection', function (done) {
    done();
  });

  it.skip('saves some results', function (done) {
    done();
  });

  it.skip('sees those results via redis connection subscription', function (done) {
    done();
  });
});
