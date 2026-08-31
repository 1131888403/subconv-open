# SubConv 快速使用指南

## 📦 安装

```bash
cd subconv          # 进入仓库目录
pip install pyyaml flask    # pyyaml 必需；flask 仅用于 Web 界面
# Alpine 镜像下： apk add py3-yaml py3-flask
```

## 🚀 命令行使用

### 基本用法

```bash
# 从 URL 转换
python3 subconv -i "https://example.com/subscribe" -o output.yaml -t clash

# 从文件转换
python3 subconv -i input.yaml -o output.json -t singbox

# 查看节点列表
python3 subconv -i input.yaml -l
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `-i` | 输入（URL 或文件路径） |
| `-o` | 输出文件路径 |
| `-t` | 目标格式：clash, singbox, v2ray |
| `-l` | 仅列出节点 |

## 🌐 Web 界面

启动 Web UI：
```bash
python3 webui.py
# 或
./start-webui
```

然后访问 http://127.0.0.1:5000

## 📝 示例

### 示例 1: 在线订阅转 Clash
```bash
python3 subconv \
  -i "https://api.provider.com/sub?token=xxx" \
  -o clash-config.yaml \
  -t clash
```

### 示例 2: Clash 转 SingBox
```bash
python3 subconv \
  -i clash-config.yaml \
  -o singbox-config.json \
  -t singbox
```

### 示例 3: 批量转换
```bash
python3 subconv -i sub.yaml -o clash.yaml -t clash
python3 subconv -i sub.yaml -o singbox.json -t singbox
python3 subconv -i sub.yaml -o v2ray.txt -t v2ray
```

## 🔄 支持格式

### 输入
- ✅ Base64 URI 订阅
- ✅ Clash YAML
- ✅ SingBox JSON
- ✅ 原始 URI 列表

### 输出
- ✅ Clash (YAML)
- ✅ SingBox (JSON)
- ✅ V2Ray (Base64 URI)

### 协议
- ✅ VMess
- ✅ VLESS (含 Reality)
- ✅ Trojan
- ✅ Shadowsocks
- ✅ Hysteria2
- ✅ Tuic
- ✅ WireGuard

## 🧪 测试

运行测试套件：
```bash
./test.sh
```

## 📂 文件说明

```
subconv/
├── converter.py      # 核心转换引擎
├── subconv           # CLI 入口
├── webui.py          # Web 界面
├── start-webui       # Web UI 启动脚本
├── README.md         # 详细文档
├── QUICKSTART.md     # 本文件
├── test.sh           # 测试脚本
├── test-subscription.yaml  # 测试文件
└── test-base64.txt   # 测试文件
```

## 💡 提示

1. **Clash Meta**: 使用 Hysteria2/Tuic/VLESS Reality 时推荐 Clash Meta
2. **节点名称**: 支持 emoji 和 Unicode
3. **批量处理**: 可一次转换生成多种格式
4. **Web UI**: 适合不熟悉命令行的用户
