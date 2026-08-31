# Architecture

## Browser UI

`template.html` 提供页面结构和样式，`js/` 按编号拆分功能。`build.js` 将这些模块按顺序合并到 `app.js`，并注入 `template.html`，生成无需 CDN 的单文件 `index.html`。

浏览器端负责解析订阅、节点名标注、格式生成、二维码和本地文件/粘贴内容处理。二维码在本地生成，不上传链接。

公开版的 `SELF_HOSTED_RELAY` 默认为空，避免默认依赖维护者的服务器。部署者可在自己的构建副本中设置 relay origin。

## Python converter

`converter.py` 是 CLI 和 relay 重建逻辑共用的解析/生成核心，负责 URI、Clash YAML、sing-box JSON、Surge 等格式之间的转换。

## Optional relay

`fetch_proxy_v2.py` 是可选的自建服务：

1. 接收经过 Nginx 注入的服务端 Token；
2. 校验上游 URL，阻止私网、保留地址、危险端口和不安全重定向；
3. 根据客户端 User-Agent 获取上游订阅；
4. 在需要时使用 `converter.py` 重建目标格式；
5. 为长期订阅保存随机 relay ID，并支持缓存和陈旧副本回退。

relay 不应作为公共开放代理部署。Token 必须通过权限受限的环境文件提供，relay 数据文件也必须限制权限。

## Data flow

```text
paste/file/direct URL
        │
        ▼
 browser parser ──► local output / QR
        │
        └── optional self-hosted relay ──► upstream subscription
                                             │
                                             ▼
                                  format-preserving response
```
