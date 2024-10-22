# haraka-plugin-watch

[![Build Status][ci-img]][ci-url]
[![Code Climate][clim-img]][clim-url]

[![NPM][npm-img]][npm-url]

Watch live SMTP traffic in a web interface.

![Watch Screen Capture](http://www.tnpi.net/internet/mail/haraka-watch.png)

## Enable Watch

1. Enable Haraka's HTTP server (see `listen` in http.ini)
2. Add 'watch' to config/plugins
3. Point your web browser at http://mail.your-domain.com/watch/

Enjoy the blinky lights.

## Tips

- Hover your mouse pointer or tap (with touch devices) on table data to see more details.
- Copy that connection UUID at left and use it to grep your logs for even more.
- Edit the files in watch/html and play with the appearance. If you make it
  better, post a screen shot somewhere and create an Issue or PR.

## Interpretation Key

- Green: tests passed
- Light Green: tests passed, but with conditions
- Yellow: poor results, but not awful.
- Light red: tests failed, but no rejection
- Red: tests failed causing rejection

## Config

Config options are set in watch.ini.

- sampling: boolean, limit display connections to one-per-second
- wss.url: specify the WSS url (default: same scheme, host, port as http)
- wss.htdocs: an alternate docroot (default ./html)

## Troubleshooting

- If you aren't getting activity, make sure your web browser is able to establish the websockets connection. Either use straight http (only) or have a valid signed TLS certificate. The security for websockets connections is more strict than plain HTTP(s).
- Additional info:
  - [Watch not working](https://github.com/haraka/Haraka/issues/2385)
  - [Running under AWS ELB](https://github.com/haraka/haraka-plugin-watch/issues/2)

[ci-img]: https://github.com/haraka/haraka-plugin-watch/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/haraka/haraka-plugin-watch/actions/workflows/ci.yml
[clim-img]: https://codeclimate.com/github/haraka/haraka-plugin-watch/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/haraka/haraka-plugin-watch
[npm-img]: https://nodei.co/npm/haraka-plugin-watch.png
[npm-url]: https://www.npmjs.com/package/haraka-plugin-watch
