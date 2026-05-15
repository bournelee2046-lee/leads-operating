#!/bin/bash

echo "=========================================="
echo "  线索运营监控系统 - 启动脚本"
echo "=========================================="
echo ""

# 检查数据库文件
if [ ! -f "../leads.db" ]; then
    echo "警告: 找不到数据库文件 ../leads.db"
    echo ""
elif [ ! -w "../leads.db" ]; then
    echo "错误: 数据库文件 ../leads.db 当前不可写"
    echo "账号权限系统首次启动需要写入系统表，请先修复文件权限后再启动。"
    echo ""
    exit 1
fi

echo "正在清理旧服务进程..."
pkill -f "python3 backend.py" 2>/dev/null
pkill -f "python3 backend/app_v2.py" 2>/dev/null
pkill -f "python.*backend/app_v2.py" 2>/dev/null

echo "正在启动后端API服务 (端口 5001)..."
python3 backend/app_v2.py &
BACKEND_PID=$!

# 等待后端启动
sleep 3

echo ""
echo "正在启动前端开发服务 (端口 5173)..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "  服务已启动！"
echo "  前端地址: http://localhost:5173"
echo "  后端地址: http://localhost:5001"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "=========================================="
echo ""

# 等待用户中断
trap "echo ''; echo '正在停止服务...'; kill $BACKEND_PID 2>/dev/null; kill $FRONTEND_PID 2>/dev/null; echo '服务已停止'; exit 0" INT

wait
