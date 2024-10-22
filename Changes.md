
### Unreleased


### [2.0.5] - 2024-10-22

- html/client: updated dnsbl -> dns-list
- deps version bumps:
  - redis 4.7.0
  - ws 8.18.0
- populate [files] in package.json. Delete .npmignore.

### [2.0.4] - 2023-12-29

#### Added

- feat(ignore): ignore configured IPs (useful to suppress monitoring)
- feat(dns-list): added plugin config
- eslint prefer-template #53


### 2.0.3 - 2023-12-12

- deps: bump versions
- ci: test on node 18 & 20 (was 14 & 16)
- rename data.uribl -> uribl


### 2.0.2 - 2022-05-27

- dep: depend directly on redis


### 2.0.1 - 2022-05-27

- fix: plugin.redis_subscribe_pattern is now async


### 2.0.0 - 2022-05-25

- dep(pi-redis): 1 -> 2
- dep(eslint): v6 -> 8
- dep(tipsy): jquery.tipsy 1.0.2 -> 1.3.1
- dep(jquery): 1.10 -> 3.6
- dep(ws): 7.5.7 -> 8
- chore(ci): consolidate CI jobs to ci.yml
- chore(ci): add publish & codeql actions
- chore(client): replace string concat with interp


### 1.0.15 - 2021-01-15

- check that connection.remote exists before accessing
- client: string concat -> es6 interpolated strings


### 1.0.14 - 2020-07-30

- rename data.headers -> headers
- update tipsy.js


### 1.0.13 - 2019-05-22

- update WS to v6.1.2
- es6 updates #26, #27
- dmarc: add support #37
- tls: light up for port 465 #37


### 1.0.12 - 2017-09-11

- update for qmd rename #22
- coalesce outbound to queue #22

### 1.0.11 - 2017-07-30

- update broadcast syntax to be compatible with ws > 1
- some ES6 syntax updates (var/let, arrow funcs)
- remove async dependency (unused)

### 1.0.10 - 2017-06-26

- revert #14, it breaks current and future Haraka deployments

### 1.0.9 - 2017-06-16

- eslint 4 compat fixes

### 1.0.8 - 2017-06-08

- handle malformed haraka results
- enable haraka-results publishing #14

### 1.0.7 - 2017-03-31

- add default config/watch.ini file 
- add config section to README
- add repo badges
- remove legacy "walk the connection/transaction to find results" code
- replace some function () { calls with arrow functions
- handle smtp_forward recipient validation results
- collapse dkim sign/verify to a single field

### 1.0.6 - 2017-01-25

- plugins w/o pass results are now light grey (was light green)

### 1.0.5 - 2017-01-24

- added plugin known-senders
- removed grunt

### 1.0.4 - 2017-01-01

- lint fixes

### 1.0.3 - 2016-10-25

- set logs URLs to open in new browser window

### Oct 23 22:23:57 2016

- add new names of plugins published to npm

### Oct 10 20:26:45 2016

- enable more data plugins by default

### Oct 10 19:33:41 2016

- add start of test suite

### Oct 8 23:28:07 2016

- initial import
[2.0.4]: https://github.com/haraka/haraka-plugin-watch/releases/tag/2.0.4
[2.0.5]: /releases/tag/2.0.5
