#!/bin/bash

echo "=========================================="
echo "  线索运营监控系统 - 启动脚本"
echo "=========================================="
echo ""

# 检查数据库文件
if [ ! -f "../leads.db" ]; then
    echo "警告: 找不到数据库文件 ../leads.db"
    echo ""
fi

echo "正在启动后端API服务 (端口 5001)..."
python3 backend.py &
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
