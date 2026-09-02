# SubConv

一个支持自建的代理订阅转换工具，包含网页界面、Python 命令行工具，以及可选的订阅抓取中转服务。

> 仅用于处理你有权使用的订阅和服务器。本项目不提供公共中转服务，也不包含任何机场订阅或节点。

[![Tests](https://github.com/1131888403/subconv-open/actions/workflows/test.yml/badge.svg)](https://github.com/1131888403/subconv-open/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 功能

- 支持 URI 列表、Clash YAML、sing-box JSON、Surge 配置等输入格式；
- 支持生成 Clash/Mihomo、sing-box、V2Ray、Surge、Quantumult X 配置；
- 纯前端单文件网页，不依赖框架和外部 CDN；
- 支持 URL、文件、粘贴文本三种输入方式；
- 支持节点名标注：地址、IP、端口，以及 `复用N` / `独占` 判断；
- 支持节点删减：手动删除、关键词、协议、端口、正则和复用节点去重；
- 支持本地生成订阅二维码，二维码内容不会上传第三方；
- 可选的 `fetch_proxy_v2.py` 自建中转，包含 SSRF 防护、缓存、User-Agent 回退、relay 链接和 Token 脱敏。

## 在线使用

项目不绑定维护者的中转服务器。下载仓库中的 `index.html` 后，可以直接用浏览器打开，或部署到任意静态网站。

如果订阅服务器允许浏览器跨域访问，可以直接选择 URL 输入；如果遇到 CORS 限制或需要特定 User-Agent，建议：

解析成功后，网页还可以按关键词、协议、端口、正则或复用关系删减节点。删减结果只保存在本机，导出配置或“删减后订阅”是一次性结果；它不会同步到中转服务器。需要持续更新时，请用原始订阅地址创建中转链接；需要固定节点集合时，请导出删减后的文件并直接导入客户端。



1. 使用客户端复制订阅内容；
2. 粘贴到网页的「粘贴内容」输入框；或
3. 部署自己的中转服务。

## 快速开始

### 网页版

```sh
node build.js
```

执行后会生成独立的 `index.html`，将它部署到静态网站即可。

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

```sh
node build.js
node test-js.js
python3 -m py_compile converter.py fetch_proxy.py fetch_proxy_v2.py webui.py
```

## 自建中转

`fetch_proxy_v2.py` 只建议部署在你自己控制的服务器上。完整说明见 [DEPLOY.md](DEPLOY.md) 和 [docs/SELF_HOST.md](docs/SELF_HOST.md)。

启用前请注意：

1. 生成随机的 `SUBCONV_PROXY_TOKEN`，放在权限受限的环境文件中，绝不能提交到仓库；
2. 将 Nginx 示例中的 `subconv.example.com` 和 `__SUBCONV_TOKEN__` 替换为自己的值；
3. 在 `js/6-ui.js` 中设置自己的 HTTPS `SELF_HOSTED_RELAY`，然后重新执行 `node build.js`；
4. 不要暴露未鉴权的通用抓取接口；
5. relay 链接属于 bearer secret，不要公开分享。

公开版默认 `SELF_HOSTED_RELAY = ''`，因此不会指向维护者的服务器。

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
