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
});