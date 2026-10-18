# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository:

**https://github.com/Divine-Owl/Mercury-Browser/security/advisories/new**

That channel stays private until a fix is published. Please do not open a public
issue first.

A useful report says what you did, what happened, and enough to reproduce it:
the version (`mercury-browser --version`, or About in the app menu), how you
installed Mercury (`.deb`, `.rpm` or AppImage), your distribution, and whether the
same thing happens in upstream Min.

## Versions

Only the most recent release is supported. Mercury 0.1.x is the current line;
fixes land on `main` and are released in the next patch.

## Upstream Min

Mercury is a fork of [Min](https://github.com/minbrowser/min) and inherits its
code. If a vulnerability is upstream Min's and not specific to this fork, report it
upstream, at
https://github.com/minbrowser/min/security/advisories/new — Min's maintainers do
not monitor this repository, so a report filed here will not reach them.

## What is different here

Mercury collects no usage statistics and has no update feed, which removes two
classes of attack surface and one privacy problem. It also means a packaged
Mercury will not tell you that a security release exists; see the update-path note
in `README.md`.
