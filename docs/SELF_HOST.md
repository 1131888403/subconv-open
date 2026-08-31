# Self-hosting the relay

本文件只说明如何部署自己的中转，不提供公共中转地址。

## 安全要求

- 使用 HTTPS；
- `SUBCONV_PROXY_TOKEN` 使用随机值，放在权限为 600 的环境文件中；
- 保留程序的 SSRF 校验，不要把通用 fetch 接口暴露给未授权用户；
- 不要提交环境文件、relay 数据、Nginx 实际配置或访问日志；
- relay URL 是 bearer secret，不要放入公开 Issue 或截图。

## 部署概览

1. 准备 Python 3.7+ 和 PyYAML；
2. 以受限用户运行 `fetch_proxy_v2.py`；
3. 按 `deploy/nginx-site.conf.example` 配置站点、证书和反向代理；
4. 将 `__SUBCONV_TOKEN__` 替换为服务器上的同一个 Token；
5. 在前端 `js/6-ui.js` 设置自己的 HTTPS relay origin；
6. 执行 `node build.js`，将生成的 `index.html` 部署到静态网站；
7. 用 `/health` 检查服务，再用测试订阅验证 `/my-fetch` 和 `/my-create`。

不要直接复制生产环境配置。示例里的域名、证书路径和 Token 都必须替换。
