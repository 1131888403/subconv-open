# SubConv

把一条订阅，变成你真正想用的样子。

SubConv 是一个代理订阅转换工具：它能在浏览器里解析订阅、转换客户端格式、整理节点名称、删掉不想要的节点，也可以配合你自己的服务器解决 CORS 和 User-Agent 问题。项目同时提供 Python 命令行工具和可选的自建订阅中转服务。

> 仅用于处理你有权使用的订阅和服务器。本项目不提供公共中转服务，也不包含任何机场订阅或节点。

[![Tests](https://github.com/1131888403/subconv-open/actions/workflows/test.yml/badge.svg)](https://github.com/1131888403/subconv-open/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 它能帮你做什么

### 机场给了订阅，你的客户端却不配合
同一条订阅，在 Clash、sing-box、V2RayN、Surge 里需要的格式并不一样。SubConv 把它解析成目标客户端能直接导入的配置，VMess、VLESS Reality、Trojan、Shadowsocks、Hysteria2、Tuic、WireGuard、AnyTLS、SOCKS5 等常见协议都可以处理。

### 节点太多，想留下真正需要的
打开订阅后，可以逐个删除节点，也可以按地区名称、协议、端口、正则表达式批量删减。入口地址相同的节点还可以按协议和地址端口识别复用关系，自动只留一个。

### 浏览器拿不到订阅
有些机场会根据 User-Agent 返回内容，浏览器拿到的是空壳；有些订阅服务器没有 CORS 响应头，网页无法读取。你可以直接粘贴订阅内容，也可以部署自己的 relay，让服务器代为抓取。

### 功能一览

- 纯前端单文件网页，不依赖框架和外部 CDN；
- 支持 URL、文件、粘贴文本三种输入方式；
- 支持生成 Clash/Mihomo、sing-box、V2Ray、Surge、Quantumult X 配置；
- 支持节点名标注：地址、IP、端口，以及 `复用N` / `独占` 判断；
- 支持本地生成订阅二维码，二维码内容不会上传第三方；
- 可选的 `fetch_proxy_v2.py` 自建中转，包含 SSRF 防护、缓存、User-Agent 回退、relay 链接和 Token 脱敏。

## 适合什么场景

SubConv 适合这些情况：

- 机场只提供一种订阅格式，但你的客户端需要另一种格式；
- 机场按 User-Agent 返回不同内容，浏览器拿到空配置或错误格式；
- 机场订阅没有 CORS 响应头，网页无法直接读取；
- 节点很多，需要按协议、端口、关键词、正则或复用入口删减；
- 想把同一个订阅转换成 Clash、sing-box、V2Ray、Surge 或 Quantumult X 格式。

SubConv 只负责解析和转换订阅，不提供节点、不检测节点质量，也不会替你获取没有权限使用的订阅。

## 支持范围

### 输入格式

| 输入 | 说明 |
|------|------|
| URI 列表 | 明文节点 URI，或 Base64 编码的 URI 订阅 |
| Clash | Clash / Clash Meta YAML 配置 |
| sing-box | sing-box JSON 配置 |
| Surge | Surge 配置文件 |
| Quantumult X | Quantumult X 配置中的节点格式 |

### 输出格式

| 输出 | 适用客户端 |
|------|------------|
| Clash / Clash Meta | Clash Meta、Mihomo、Clash Verge 等 |
| sing-box | sing-box 及其衍生客户端 |
| V2Ray | V2RayN、V2RayNG、Qv2ray 等 |
| Surge | Surge |
| Quantumult X | Quantumult X |

### 协议

网页端和本地转换器支持 VMess、VLESS（包括 Reality）、Trojan、Shadowsocks、Hysteria2 / `hy2`、Tuic、WireGuard、AnyTLS、SOCKS5 和 HTTP/HTTPS 等常见协议。不同输出格式对协议字段的支持由目标客户端决定；例如 Hysteria2、Tuic 和 VLESS Reality 优先导出到 Clash Meta 或 sing-box。

## 网页使用流程

把它当成一个本地工具就好：打开页面，放入订阅，确认节点，再决定是“整理后导出”还是“交给自建 relay 持续更新”。

1. 打开仓库中的 `index.html`，或打开你部署后的网页地址。
2. 在“URL”“文件”或“粘贴内容”中提供订阅。
3. 如果 URL 直连受到 CORS 限制，改用客户端复制的内容粘贴，或配置自己的 relay。
4. 等待网页显示解析格式和节点数量，先确认节点数量符合预期。
5. 根据需要标注节点名、删减节点，再选择输出格式和其他选项。
6. 生成并下载配置，导入对应客户端；使用新协议时优先选择 Clash Meta / Mihomo 或 sing-box。

网页解析完全在浏览器本地完成。订阅 URL 只有在你选择 URL 抓取或自建 relay 时才会发送到对应服务；二维码由浏览器本地生成，不上传第三方。

## 节点删减

解析完成后，可以从节点列表逐个删除，也可以使用规则批量删减：

| 写法 | 作用 |
|------|------|
| `hk` | 节点名称包含关键词即删除 |
| `type:hysteria2` | 按协议删除，`hy2` / `hysteria` 是别名 |
| `port:443` | 按端口删除 |
| `re/^🇺🇸/i` | 按正则表达式删除 |
| `！hk` | 豁免包含 `hk` 的节点 |
| 删除复用节点 | 同协议、同地址和端口只保留第一个 |

多个规则之间是“或”关系，命中任一规则就会删除。删除状态按输入来源保存在浏览器本地；同一 URL 或同一份文本再次导入时可以恢复。订阅内容发生变化后不会强行套用旧删除记录，以避免误删新节点。

删减后的 Clash、sing-box、V2Ray 等输出只包含当前存活节点。“删减后订阅”是一次性导出的 Base64 URI 文件，不是动态订阅。

> **重要边界**：网页删减不会上传到服务器，也不会写入已经创建的 relay 链接。需要持续更新时，请用原始订阅地址创建 relay；需要固定节点集合时，删减后导出文件并直接导入客户端。

## Clash 分流规则与 GeoSite

生成 Clash 配置时可以选择基础分流规则，包含常用服务、广告拦截、私有地址、中国域名和中国 IP 直连。非中国域名使用 `geolocation-!cn`，并显式配置 MetaCubeX GeoSite 下载地址。

如果客户端报错 `list proxy not found in GeoSite.dat`：

1. 删除或更新客户端缓存的 `GeoSite.dat`；
2. 重新导入网页生成的最新配置；
3. 确认客户端允许下载 GeoSite 数据；
4. 不要把规则手动改回已经不存在的 `GEOSITE,proxy`。

GeoSite 属于客户端外部数据，不随 SubConv 网页内置。网络无法下载 GeoSite 时，客户端的分流规则可能无法加载，但节点转换本身不受影响。

## 在线使用

项目不绑定维护者的中转服务器。下载仓库中的 `index.html` 后，可以直接用浏览器打开，或部署到任意静态网站。

如果订阅服务器允许浏览器跨域访问，可以直接选择 URL 输入；否则最简单的办法是从客户端复制订阅内容，粘贴到网页的“粘贴内容”输入框。需要网页自动抓取或客户端长期更新时，再部署自己的 relay。

## 快速开始

### 网页版

仓库已经包含可直接打开的 `index.html`。如果修改了 `template.html` 或 `js/` 源码，重新构建：

```sh
node build.js
```

执行后会重新生成独立的 `app.js` 和 `index.html`，将 `index.html` 部署到静态网站即可。网页不需要 npm、前端框架或外部 CDN。

### 本地网页服务器

直接打开文件通常已经够用；如浏览器限制本地文件能力，可以启动仓库自带的 Web UI：

```sh
pip install pyyaml flask
python3 webui.py
# 浏览器打开 http://127.0.0.1:5000
```

### 输出选择建议

- 使用 Hysteria2、Tuic 或 VLESS Reality：选择 Clash Meta / Mihomo 或 sing-box；
- 需要自动更新：使用原始订阅地址创建自建 relay；
- 需要固定删减后的节点：导出配置或“删减后订阅”，不要创建 relay；
- 只想确认解析是否正常：先用节点列表查看，再选择输出格式。

### Python 命令行

需要 Python 3.7+ 和 PyYAML：

```sh
pip install pyyaml

# 转换为 Clash/Mihomo
python3 subconv -i input.yaml -o output.yaml -t clash

# 转换为 sing-box
python3 subconv -i input.yaml -o output.json -t singbox

# 转换为 V2Ray 订阅
python3 subconv -i input.yaml -o output.txt -t v2ray

# 只列出节点
python3 subconv -i input.yaml -l
```

### 测试

修改前端源码后，必须先构建再测试：

```sh
node build.js
node test-js.js
python3 -m py_compile converter.py fetch_proxy.py fetch_proxy_v2.py webui.py
```

当前前端回归测试覆盖输入解析、格式互转、Reality 字段、节点分组、节点删减、复用去重、二维码和 Clash GeoSite/fake-ip-filter 规则，结果应为 `PASS 134  FAIL 0`。

## 自建中转

`fetch_proxy_v2.py` 只建议部署在你自己控制的服务器上。完整说明见 [DEPLOY.md](DEPLOY.md) 和 [docs/SELF_HOST.md](docs/SELF_HOST.md)。

启用前请注意：

1. 生成随机的 `SUBCONV_PROXY_TOKEN`，放在权限受限的环境文件中，绝不能提交到仓库；
2. 将 Nginx 示例中的 `subconv.example.com` 和 `__SUBCONV_TOKEN__` 替换为自己的值；
3. 在 `js/6-ui.js` 中设置自己的 HTTPS `SELF_HOSTED_RELAY`，然后重新执行 `node build.js`；
4. 不要暴露未鉴权的通用抓取接口；
5. relay 链接属于 bearer secret，不要公开分享。

公开版默认 `SELF_HOSTED_RELAY = ''`，因此不会指向维护者的服务器。

### Relay 的实际行为

自建 relay 解决的是“网页读不到”和“客户端每次都要手动换链接”，不是节点测速，也不是神奇地把线路换到另一台服务器。

relay 保存原始订阅 URL、请求 User-Agent 和可选的节点名标注模式。客户端每次刷新 relay 链接时，服务器重新抓取上游订阅；v2 默认使用 15 分钟应用缓存，并在上游失败时最多使用 24 小时的陈旧副本。

relay 不保存网页中的节点删减状态。手动删除、关键词、协议、端口、正则和复用去重只影响浏览器本地生成的结果；机场更新后，relay 仍按原始订阅返回新的节点集合。relay ID 等同于访问凭据，不要放到公开仓库、Issue、截图或群组中。

使用时记住这条分界线：

- 想让节点以后随机场变化：用原始订阅地址创建 relay；
- 想固定只保留几个节点：网页删减后导出配置或“删减后订阅”；
- 想让 relay 也跟着你的删减规则变化：当前版本还不支持。

现场重建模式的协议范围比网页解析器窄，`hy2://` 简写、AnyTLS、SSR 和旧版 Hysteria 可能无法在服务端重建时保留。正常透传上游格式时不受这条限制。完整部署和安全边界见 [DEPLOY.md](DEPLOY.md) 与 [RELAY.md](RELAY.md)。

## 项目结构

- `template.html`、`js/`、`build.js`：网页源码和构建脚本；
- `index.html`：生成的单文件网页；
- `converter.py`、`subconv`：Python 转换核心和命令行工具；
- `fetch_proxy_v2.py`：可选的自建中转服务；
- `js/9-filter.js`：网页节点删减逻辑；
- `deploy/nginx-site.conf.example`：Nginx 部署示例；
- `docs/`：架构、自建部署和贡献说明。

更多设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 安全提醒

请先阅读 [SECURITY.md](SECURITY.md)。严禁提交以下内容：

- 真实订阅链接、Token、relay ID；
- 真实节点 URI 或包含密码的配置；
- API Key、API Secret、私钥；
- 真实服务器配置、访问日志和 relay 数据文件。

如果凭据曾经泄露，必须立即撤销或轮换；仅删除 Git 提交不能使泄露的凭据失效。

## 许可证和第三方依赖

本项目采用 [MIT License](LICENSE) 开源。`vendor/qrcode.js` 使用 MIT 许可的 qrcode-generator 库，重新发布时请保留其版权和许可声明。

## 相关文档

- [更新记录](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [社区行为准则](CODE_OF_CONDUCT.md)
- [安全策略](SECURITY.md)
