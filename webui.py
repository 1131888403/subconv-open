#!/usr/bin/env python3
"""
SubConv Web UI - 基于 Flask 的网页界面
"""

import sys
import os
import json
import tempfile
from flask import Flask, request, jsonify, send_file, render_template_string

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from converter import SubConv

app = Flask(__name__)

HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SubConv - 订阅转换工具</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            padding: 20px;
            color: #fff;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            margin-bottom: 10px;
            font-size: 2.5em;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 30px;
        }
        .card {
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #00d9ff;
        }
        input[type="text"], input[type="url"], textarea, select {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 14px;
            margin-bottom: 15px;
        }
        input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: #00d9ff;
        }
        textarea {
            min-height: 150px;
            resize: vertical;
            font-family: monospace;
        }
        select {
            cursor: pointer;
        }
        .radio-group {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
        }
        .radio-group label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 10px 15px;
            background: rgba(0,0,0,0.2);
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.3s;
        }
        .radio-group label:hover {
            border-color: #00d9ff;
        }
        .radio-group input[type="radio"] {
            accent-color: #00d9ff;
        }
        .btn {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary {
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            color: #000;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,217,255,0.4);
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .result {
            margin-top: 20px;
            padding: 20px;
            background: rgba(0,255,136,0.1);
            border: 1px solid #00ff88;
            border-radius: 8px;
            display: none;
        }
        .result.error {
            background: rgba(255,0,0,0.1);
            border-color: #ff4444;
        }
        .result h3 {
            margin-bottom: 10px;
        }
        .node-list {
            max-height: 300px;
            overflow-y: auto;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 10px;
            margin-top: 10px;
        }
        .node-item {
            padding: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            font-family: monospace;
            font-size: 13px;
        }
        .node-item:last-child {
            border-bottom: none;
        }
        .loading {
            text-align: center;
            padding: 20px;
            display: none;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top-color: #00d9ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .tab {
            padding: 10px 20px;
            background: rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s;
        }
        .tab.active {
            background: rgba(0,217,255,0.2);
            border-color: #00d9ff;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .download-link {
            display: inline-block;
            margin-top: 10px;
            padding: 10px 20px;
            background: #00d9ff;
            color: #000;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
        }
        .download-link:hover {
            background: #00ff88;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔄 SubConv</h1>
        <p class="subtitle">通用订阅转换工具 - Clash / SingBox / V2Ray</p>

        <div class="tabs">
            <div class="tab active" data-tab="url">URL 订阅</div>
            <div class="tab" data-tab="file">文件上传</div>
            <div class="tab" data-tab="text">文本输入</div>
        </div>

        <div class="card">
            <div id="tab-url" class="tab-content active">
                <label>订阅 URL</label>
                <input type="url" id="input-url" placeholder="https://example.com/subscribe?token=xxx">
            </div>

            <div id="tab-file" class="tab-content">
                <label>上传订阅文件</label>
                <input type="file" id="input-file" accept=".yaml,.yml,.json,.txt">
            </div>

            <div id="tab-text" class="tab-content">
                <label>粘贴订阅内容</label>
                <textarea id="input-text" placeholder="粘贴 Base64 订阅、Clash YAML 或 SingBox JSON..."></textarea>
            </div>

            <label>目标格式</label>
            <div class="radio-group">
                <label>
                    <input type="radio" name="target" value="clash" checked>
                    📋 Clash
                </label>
                <label>
                    <input type="radio" name="target" value="singbox">
                    🦊 SingBox
                </label>
                <label>
                    <input type="radio" name="target" value="v2ray">
                    ✈️ V2Ray
                </label>
            </div>

            <button class="btn btn-primary" onclick="convert()">🚀 开始转换</button>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>转换中...</p>
            </div>

            <div class="result" id="result"></div>
        </div>
    </div>

    <script>
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            });
        });

        async function convert() {
            const loading = document.getElementById('loading');
            const result = document.getElementById('result');
            const target = document.querySelector('input[name="target"]:checked').value;

            loading.style.display = 'block';
            result.style.display = 'none';
            result.className = 'result';

            let formData = new FormData();
            formData.append('target', target);

            const activeTab = document.querySelector('.tab.active').dataset.tab;
            if (activeTab === 'url') {
                const url = document.getElementById('input-url').value;
                if (!url) {
                    showError('请输入订阅 URL');
                    return;
                }
                formData.append('input_type', 'url');
                formData.append('input', url);
            } else if (activeTab === 'file') {
                const file = document.getElementById('input-file').files[0];
                if (!file) {
                    showError('请选择文件');
                    return;
                }
                formData.append('input_type', 'file');
                formData.append('file', file);
            } else {
                const text = document.getElementById('input-text').value;
                if (!text) {
                    showError('请输入订阅内容');
                    return;
                }
                formData.append('input_type', 'text');
                formData.append('input', text);
            }

            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                loading.style.display = 'none';

                if (data.success) {
                    showResult(data);
                } else {
                    showError(data.error || '转换失败');
                }
            } catch (e) {
                loading.style.display = 'none';
                showError('网络错误：' + e.message);
            }
        }

        function showResult(data) {
            const result = document.getElementById('result');
            let html = '<h3>✅ 转换成功</h3>';
            html += '<p>节点数量：<strong>' + data.node_count + '</strong></p>';

            if (data.nodes && data.nodes.length > 0) {
                html += '<div class="node-list">';
                data.nodes.slice(0, 20).forEach(node => {
                    html += '<div class="node-item">' + node + '</div>';
                });
                if (data.nodes.length > 20) {
                    html += '<div class="node-item">... 还有 ' + (data.nodes.length - 20) + ' 个节点</div>';
                }
                html += '</div>';
            }

            if (data.download_url) {
                html += '<a href="' + data.download_url + '" class="download-link" download>📥 下载配置文件</a>';
            }

            result.innerHTML = html;
            result.style.display = 'block';
        }

        function showError(msg) {
            const result = document.getElementById('result');
            result.innerHTML = '<h3>❌ 错误</h3><p>' + msg + '</p>';
            result.className = 'result error';
            result.style.display = 'block';
        }
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/convert', methods=['POST'])
def api_convert():
    try:
        target = request.form.get('target', 'clash')
        input_type = request.form.get('input_type', 'text')
        input_data = request.form.get('input', '')

        converter = SubConv()

        # Load subscription
        if input_type == 'url':
            if not input_data.startswith(('http://', 'https://')):
                return jsonify({'success': False, 'error': '无效的 URL'})
            if not converter.load_from_url(input_data):
                return jsonify({'success': False, 'error': '无法加载订阅'})
        elif input_type == 'file':
            file = request.files.get('file')
            if not file:
                return jsonify({'success': False, 'error': '没有文件'})
            content = file.read().decode('utf-8')
            if not converter.load_from_content(content):
                return jsonify({'success': False, 'error': '无法解析文件内容'})
        else:
            if not input_data:
                return jsonify({'success': False, 'error': '没有输入内容'})
            if not converter.load_from_content(input_data):
                return jsonify({'success': False, 'error': '无法解析订阅内容'})

        # Get node list
        nodes = [f"[{n.protocol.value}] {n.name} - {n.server}:{n.port}" for n in converter.nodes]

        # Create temp file for output
        ext = {'clash': 'yaml', 'singbox': 'json', 'v2ray': 'txt'}[target]
        temp_file = tempfile.NamedTemporaryFile(mode='w', suffix=f'.{ext}', delete=False)
        temp_path = temp_file.name
        temp_file.close()

        # Export
        if target == 'clash':
            converter.export_clash(temp_path)
        elif target == 'singbox':
            converter.export_singbox(temp_path)
        elif target == 'v2ray':
            converter.export_v2ray(temp_path)

        return jsonify({
            'success': True,
            'node_count': len(converter.nodes),
            'nodes': nodes,
            'download_url': f'/download/{os.path.basename(temp_path)}'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/download/<filename>')
def download(filename):
    temp_dir = tempfile.gettempdir()
    return send_file(os.path.join(temp_dir, filename), as_attachment=True)

if __name__ == '__main__':
    print("Starting SubConv Web UI on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=False)
