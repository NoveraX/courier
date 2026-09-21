# Security Policy

Courier sits on the boundary between a browser and the services a server may
reach. A proxied call is executed by the server, with the server's
credentials, on behalf of a caller the server does not control. Report
anything that weakens that boundary.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:

> Security → Report a vulnerability

That channel is private to the maintainers until an advisory is published.

Please include the package and version, what an attacker gains, and the
smallest reproduction you can manage — a failing test or a `curl` against a
local handler is ideal.

You can expect an acknowledgement within 3 working days and an assessment
within 10. If a report is accepted, you will be told when a fix is released
and credited in the advisory unless you ask otherwise.

## What is in scope

Anything that lets a caller reach past the boundary the library is supposed to
hold:

- Reaching an endpoint the application did not expose to the wire, or
  learning that a hidden endpoint or source exists.
- Steering a server-side request from the wire — its destination, its headers,
  or the credentials it carries.
- Reading another caller's cached response, session, or stream.
- Cross-site request forgery against the proxy, including the WebSocket and
  SSE upgrade paths.
- A request that costs the server unbounded memory, connections, or time.
- Secrets reaching a client bundle that the application never meant to ship.

## What is not

- A vulnerability in an application built with Courier, unless the library
  makes the mistake easy or hides it.
- Findings that require an attacker to already run code in the server process.
- Reports produced only by a scanner, with no demonstrated impact.
- Missing hardening headers on a page the library does not serve.

## Supported versions

Until the 1.x line is released, only the latest published version receives
fixes.
