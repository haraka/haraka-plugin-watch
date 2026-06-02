# haraka-plugin-watch

[![Test][ci-img]][ci-url] [![Cover][cov-img]][cov-url] [![Qlty][qlty-img]][qlty-url]

Watch live SMTP traffic in a web interface.

![Watch Screen Capture](http://www.tnpi.net/internet/mail/haraka-watch.png)

## Enable Watch

1. Enable Haraka's HTTP server (see `listen` in http.ini)
2. Add 'watch' to config/plugins
3. Point your web browser at http://mail.your-domain.com/watch/

Enjoy the blinky lights.

## Security

Watch exposes live SMTP activity — connection metadata, HELO/MAIL FROM, plugin
outcomes, and queue status — to anyone who can reach the `/watch/` endpoint. The
plugin performs no authentication; it mounts on Haraka's shared HTTP/WebSocket
server, which has none either.

Do not expose it directly to untrusted networks. Restrict access upstream:

- Put it behind a reverse proxy (haproxy, nginx) that enforces authentication.
- Or bind the HTTP `listen` in http.ini to localhost or an admin-only interface.

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

<!-- leave these buried at the bottom of the document -->

[ci-img]: https://github.com/haraka/haraka-plugin-watch/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/haraka/haraka-plugin-watch/actions/workflows/ci.yml
[cov-img]: https://codecov.io/github/haraka/haraka-plugin-watch/coverage.svg
[cov-url]: https://codecov.io/github/haraka/haraka-plugin-watch
[qlty-img]: https://qlty.sh/gh/haraka/projects/haraka-plugin-watch/maintainability.svg
[qlty-url]: https://qlty.sh/gh/haraka/projects/haraka-plugin-watch
