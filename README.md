# SubConv

A self-hosted subscription converter: browser UI, Python CLI, and an optional relay service for fetching subscription URLs that need a specific User-Agent.

> Use only with subscriptions and servers you are authorized to use. This project does not provide a public relay service.

## Features

- Convert URI lists, Clash YAML, and sing-box JSON to Clash/Mihomo, sing-box, V2Ray URI, Surge, and Quantumult X formats.
- Single-file browser UI built with no framework or CDN.
- Node-name annotations (host/IP/port and duplicate detection), local QR generation, file/paste input and output download.
- Optional `fetch_proxy_v2.py`: SSRF protections, cached upstream responses, User-Agent fallback, opaque relay links, and token redaction.

## Quick start

```sh
# Browser build
node build.js
# open index.html from a static site

# Python CLI (Python 3.7+, PyYAML)
pip install pyyaml
python3 subconv -i input.yaml -o output.yaml -t clash

# Tests
node test-js.js
```

For a URL whose server blocks browser CORS or requires a client User-Agent, either paste the subscription content into the UI or deploy **your own** relay. See [DEPLOY.md](DEPLOY.md).

## Relay deployment safety

`fetch_proxy_v2.py` is intentionally for self-hosting. Before enabling it:

1. Generate a unique `SUBCONV_PROXY_TOKEN`; put it in a permission-restricted environment file, never the repository.
2. Replace `subconv.example.com` and `__SUBCONV_TOKEN__` in the Nginx example with values for your own server.
3. Set `SELF_HOSTED_RELAY` in `js/6-ui.js` to your relay origin, then run `node build.js`. The public build deliberately leaves it empty.
4. Keep the SSRF restrictions and do not expose an unauthenticated generic fetch endpoint. Relay URLs are bearer secrets: do not share them.

## Project layout

- `template.html`, `js/`, `build.js` — browser source and build script
- `index.html` — generated standalone UI
- `converter.py`, `subconv` — CLI converter
- `fetch_proxy_v2.py` — optional production relay
- `deploy/nginx-site.conf.example` — deployment template

## License and dependencies

This project is released under [MIT](LICENSE). `vendor/qrcode.js` is the MIT-licensed qrcode-generator library; retain its notice when redistributing it.

## Security

Read [SECURITY.md](SECURITY.md) before opening an issue. Never commit subscription links, tokens, real node URIs, API credentials, or private server configuration.
