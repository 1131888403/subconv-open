# Contributing to SubConv

感谢参与 SubConv。请先阅读 `README.md` 和 `SECURITY.md`。

## 开发环境

- Node.js 18+（用于构建和 JavaScript 测试）
- Python 3.7+
- PyYAML（CLI 和后端测试需要）

```sh
node build.js
node test-js.js
python3 -m py_compile converter.py fetch_proxy_v2.py webui.py
```

提交前请确保测试通过，并确认构建产物 `index.html` 已同步更新。

## 提交规范

- 一个提交尽量只解决一个问题。
- 提交信息使用清晰的英文动词开头，例如 `Fix ...`、`Add ...`、`Update ...`。
- 新增解析或生成逻辑时，应同时增加脱敏测试样本和回归测试。
- 不要提交真实订阅链接、节点 URI、Token、API 凭据、服务器配置或 relay 数据。

## Pull Request

请在描述中说明：

1. 修改目的和行为变化；
2. 是否影响已有输出格式；
3. 已运行的测试命令及结果；
4. 是否需要更新文档或构建产物。

安全漏洞不要提交公开 Issue，请按 `SECURITY.md` 私下报告。
