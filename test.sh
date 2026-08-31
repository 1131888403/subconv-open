#!/bin/bash
# SubConv 测试脚本

cd /var/minis/workspace/subconv

echo "========================================="
echo "SubConv 订阅转换工具 - 测试套件"
echo "========================================="
echo ""

# 测试 1: Clash YAML 输入
echo "📋 测试 1: Clash YAML 输入"
python3 subconv -i test-subscription.yaml -l
echo ""

# 测试 2: Base64 URI 输入
echo "📋 测试 2: Base64 URI 输入"
python3 subconv -i test-base64.txt -l
echo ""

# 测试 3: 转换为 Clash
echo "📋 测试 3: 转换为 Clash 格式"
python3 subconv -i test-subscription.yaml -o output-clash.yaml -t clash
echo ""

# 测试 4: 转换为 SingBox
echo "📋 测试 4: 转换为 SingBox 格式"
python3 subconv -i test-subscription.yaml -o output-singbox.json -t singbox
echo ""

# 测试 5: 转换为 V2Ray
echo "📋 测试 5: 转换为 V2Ray 格式"
python3 subconv -i test-subscription.yaml -o output-v2ray.txt -t v2ray
echo ""

# 测试 6: 验证输出文件
echo "📋 测试 6: 验证输出文件"
echo "Clash 输出大小：$(wc -c < output-clash.yaml) bytes"
echo "SingBox 输出大小：$(wc -c < output-singbox.json) bytes"
echo "V2Ray 输出大小：$(wc -c < output-v2ray.txt) bytes"
echo ""

echo "========================================="
echo "✅ 所有测试完成!"
echo "========================================="
