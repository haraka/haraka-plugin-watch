
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
