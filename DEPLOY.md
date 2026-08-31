# 自建订阅中转服务部署

本目录的 `fetch_proxy.py` 是一个零依赖（仅 Python 标准库）的订阅抓取中转服务，
用于解决两个问题：

1. **浏览器无法修改 User-Agent**：多数机场按 UA 下发不同内容，用浏览器 UA 常返回空壳配置。
2. **CORS 与订阅 Token 保护**：让服务端代为抓取，Token 不进入浏览器，也不公开订阅地址。

前端网页（`index.html`）中的「我的服务器 / 个人代理」模式与「创建订阅链接」功能即指向本服务。

## 架构

```
浏览器 / 客户端
      │  HTTPS
      ▼
   Nginx ──── 静态站 /var/www/subconv/index.html
      │
      │  proxy_pass（注入服务端 Token）
      ▼
127.0.0.1:8787  fetch_proxy.py（systemd: subconv-fetch.service）
      │
      ▼  按白名单 UA 实时抓取
上游机场订阅接口
```

## 接口

| 路径 | 用途 |
|------|------|
| `/health` | 健康检查 |
| `/my-fetch?url=<订阅地址>&ua=<客户端UA>&tag=<off|host|ip|port>` | 实时抓取并透传/标注上游内容（Nginx 注入 Token，Token 不出现在浏览器） |
| `/my-create?url=<订阅地址>&ua=<客户端UA>&tag=<off|host|ip|port>` | 创建一个随机 opaque 中转 ID，并保存可选节点名标注模式，返回 `{"id":"..."}` |
| `/sub/<id>` | 客户端可直接使用的订阅链接；服务端按保存的 URL/UA/tag 实时回源 |
| `/fetch` | 内部接口，需显式携带服务端 Token，不作为公开入口 |

## 部署步骤

1. **解析域名**到服务器公网 IP（本项目示例使用 DuckDNS）。

2. **安装服务文件**

   ```bash
   # 程序与数据目录
   install -d -m 755 /opt/subconv-fetch
   install -m 644 fetch_proxy.py /opt/subconv-fetch/fetch_proxy.py
   install -d -m 700 -d /var/lib/subconv-fetch
   install -m 600 /dev/null /var/lib/subconv-fetch/relays.json

   # 运行用户与环境文件（Token 自行生成，不要提交进仓库）
   useradd -r -s /sbin/nologin subconvfetch || true
   printf 'SUBCONV_PROXY_TOKEN=%s\n' "$(openssl rand -hex 32)" > /etc/subconv-fetch.env
   chmod 600 /etc/subconv-fetch.env
   chown root:subconvfetch /etc/subconv-fetch.env
   ```

3. **systemd 单元** `/etc/systemd/system/subconv-fetch.service`

   ```ini
   [Unit]
   Description=SubConv subscription fetch relay
   After=network-online.target

   [Service]
   EnvironmentFile=/etc/subconv-fetch.env
   ExecStart=/usr/bin/python3 /opt/subconv-fetch/fetch_proxy.py
   User=subconvfetch
   Restart=always
   NoNewPrivileges=true
   ProtectSystem=strict
   ProtectHome=true
   ReadWritePaths=/var/lib/subconv-fetch

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   systemctl daemon-reload && systemctl enable --now subconv-fetch.service
   ```

   **要用 v2（缓存 + UA 降级链 + Token 脱敏）**，先把文件复制到 `/opt/subconv-fetch/`
   （`fetch_proxy_v2.py` 和 `converter.py` 都要，重建配置时靠后者），然后建缓存目录，
   并用 systemd drop-in 覆盖 `ExecStart`（保留一份，方便随时回滚）：

   ```bash
   install -d -o subconvfetch -g subconvfetch -m 700 /var/lib/subconv-fetch/cache

   mkdir -p /etc/systemd/system/subconv-fetch.service.d
   cat > /etc/systemd/system/subconv-fetch.service.d/v2.conf <<'EOF'
   [Service]
   # v2: upstream cache + UA fallback chain (drop-in; remove this file to revert)
   # /opt 在 ProtectSystem=strict 下只读，import converter 时写 .pyc 会失败
   Environment=PYTHONPYCACHEPREFIX=/run/subconv-fetch/pycache
   Environment=PYTHONUNBUFFERED=1
   ExecStart=
   ExecStart=/usr/bin/python3 /opt/subconv-fetch/fetch_proxy_v2.py --host 127.0.0.1 --port 8787 --ttl 900
   RuntimeDirectory=subconv-fetch
   RuntimeDirectoryMode=0750
   EOF

   systemctl daemon-reload && systemctl restart subconv-fetch
   curl -s http://127.0.0.1:8787/health   # 期望 "converter": true
   ```

   回滚 v1：删除 `v2.conf`，`daemon-reload` 后 `restart` 即可。

4. **Nginx**：参考 `deploy/nginx-site.conf.example`，把 `__SUBCONV_TOKEN__` 替换为
   `/etc/subconv-fetch.env` 里的同一个 Token，并修改 `server_name` 与证书路径。

   ```bash
   nginx -t && systemctl reload nginx
   ```

5. **申请 HTTPS 证书**（Let's Encrypt），确保 80 端口重定向到 443。

## 安全要点

- 仅允许 `http`/`https` 协议、端口只放开 80/443、目标域名必须解析到公网 IP；
  拒绝私网/保留地址、URL 内嵌用户名密码以及重定向 —— 防 SSRF。
- UA 只接受白名单：`clash-verge/v1.3.6`、`ClashMeta/1.18.0`、`v2rayN/6.0`、
  `v2rayNG/1.8.0`、`sing-box/1.8.0`、`NekoBox/Android/1.2.9`、`Qv2ray/2.7.0`；
  未知 UA 回退到 Clash Verge。
- 上游响应上限 8MB，抓取超时约 25 秒。
- `/sub/<id>` 中的 ID 本身即 bearer secret，不要把生成的中转链接公开分享。
- `relays.json` 目录 700 / 文件 600；systemd 已加 `NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome`。
- **不要把 `/etc/subconv-fetch.env`、订阅 URL（含 Token）或生成的中转链接提交进仓库。**
- ⚠️ **宝塔（aaPanel）用户必看**：面板自带的 `/www/server/nginx/conf/proxy.conf` 里有
  `proxy_cache cache_one;` 且**没有** `proxy_cache_valid`，此时 Nginx 会完全按后端的
  `Cache-Control` 决定缓存时长。若中转返回 `max-age`，订阅链接会被 Nginx 缓存住，
  **机场更新后客户端最长十几分钟拿不到新节点**。`fetch_proxy_v2.py` 已统一回
  `no-store`，但建议在每个 `proxy_pass` 后再加一行 `proxy_cache off;` 双重保险。
  详见 [RELAY.md](RELAY.md#已知坑宝塔面板会让订阅延迟更新)。

## 验证

```bash
curl https://<你的域名>/health

curl -G --data-urlencode "url=<订阅地址>" \
           --data-urlencode "ua=ClashMeta/1.18.0" \
           --data-urlencode "tag=host" \
     https://<你的域名>/my-create

curl "https://<你的域名>/sub/<上一步返回的 id>"
```

若上游返回 403，先直接 `curl` 原订阅地址对比：所有 UA 都 403 通常是订阅 Token 失效
或被机场限制了来源 IP，在机场后台重置订阅地址即可。
