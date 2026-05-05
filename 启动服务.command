#!/bin/bash

# 线索运营监控系统 - 启动脚本
# 使用中间层架构（v2）和 Vite 前端

echo "========================================"
echo "  线索运营监控系统"
echo "  Leads Operation Monitoring System"
echo "  架构: v2 (中间层数据方案)"
echo "========================================"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查Python环境
echo "检查Python环境..."
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "错误: 未找到Python，请先安装Python 3.8+"
    exit 1
fi

# 检查Node.js环境
echo "检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo "错误: 未找到npm，请先安装npm"
    exit 1
fi

# 检查虚拟环境，不存在则创建
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    $PYTHON_CMD -m venv venv
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 安装Python依赖
echo "安装/更新Python依赖..."
pip install -r requirements.txt

# 安装Node.js依赖
if [ ! -d "node_modules" ]; then
    echo "安装Node.js依赖..."
    npm install
fi

# 创建数据目录（如果不存在）
mkdir -p data

# 启动服务
echo ""
echo "========================================"
echo "启动服务..."
echo "========================================"
echo ""
echo "服务地址:"
echo "  - 后端API: http://localhost:5001"
echo "  - 前端页面: http://localhost:5173"
echo ""
echo "说明:"
echo "  - 后端正在使用中间层数据架构"
echo "  - 数据集市: DuckDB"
echo "  - 首次启动会初始化数据（约10-20秒）"
echo ""
echo "========================================"
echo ""

# 启动后端服务（后台运行）
cd "$SCRIPT_DIR/backend"
"$PYTHON_CMD" app_v2.py &
FLASK_PID=$!
cd "$SCRIPT_DIR"
echo "后端服务已启动 (PID: $FLASK_PID)"

# 等待后端启动
sleep 3

# 启动前端服务（后台运行）
npm run dev &
VITE_PID=$!
echo "前端服务已启动 (PID: $VITE_PID)"
echo ""
echo "正在打开浏览器..."
sleep 2
open "http://localhost:5173"

echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
trap "echo 正在停止服务...; kill $FLASK_PID $VITE_PID 2>/dev/null; exit" INT TERM
wait
