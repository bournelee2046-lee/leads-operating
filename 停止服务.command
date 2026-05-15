#!/bin/bash

cd "$(dirname "$0")"

echo "=========================================="
echo "  🛑 线索运营监控系统 - 停止服务"
echo "=========================================="
echo ""

# 查找并停止相关进程
echo "正在停止服务..."

# 停止 Python/Flask 后端
pkill -f "python3 backend.py" 2>/dev/null
pkill -f "python3 backend/app_v2.py" 2>/dev/null
pkill -f "python.*backend/app_v2.py" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 后端服务已停止"
fi

# 停止 Node/Vite 前端
pkill -f "npm run dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 前端服务已停止"
fi

# 清理日志文件（可选）
echo ""
read -p "是否清理日志文件？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f backend.log frontend.log
    echo "✅ 日志文件已清理"
fi

echo ""
echo "=========================================="
echo "  ✅ 所有服务已停止"
echo "=========================================="
echo ""
read -p "按回车键退出..."
