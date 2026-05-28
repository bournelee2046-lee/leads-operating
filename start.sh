#!/bin/bash

echo "=========================================="
echo "  线索运营监控系统 - 启动脚本"
echo "=========================================="
echo ""

# 检查数据库文件
LEADS_DB="${LEADS_RAW_DB_PATH:-$PWD/data/leads.db}"
if [ ! -f "$LEADS_DB" ]; then
    LEADS_DB="$PWD/../leads.db"
fi

if [ ! -f "$LEADS_DB" ]; then
    echo "警告: 找不到数据库文件 $LEADS_DB"
    echo ""
elif [ ! -w "$LEADS_DB" ]; then
    echo "错误: 数据库文件 $LEADS_DB 当前不可写"
    echo "账号权限系统首次启动需要写入系统表，请先修复文件权限后再启动。"
    echo ""
    exit 1
fi

echo "正在清理旧服务进程..."
pkill -f "python3 backend.py" 2>/dev/null
pkill -f "python3 backend/app_v2.py" 2>/dev/null
pkill -f "python.*backend/app_v2.py" 2>/dev/null

if command -v lsof >/dev/null 2>&1; then
    BACKEND_PORT_PIDS=$(lsof -tiTCP:5001 -sTCP:LISTEN 2>/dev/null)
    if [ -n "$BACKEND_PORT_PIDS" ]; then
        echo "检测到端口 5001 仍被旧后端占用，正在尝试终止: $BACKEND_PORT_PIDS"
        kill $BACKEND_PORT_PIDS 2>/dev/null
        sleep 2
    fi

    BACKEND_PORT_PIDS=$(lsof -tiTCP:5001 -sTCP:LISTEN 2>/dev/null)
    if [ -n "$BACKEND_PORT_PIDS" ]; then
        echo "错误: 端口 5001 仍被进程占用，无法启动新后端。"
        lsof -nP -iTCP:5001 -sTCP:LISTEN
        echo "请手动执行: kill -9 $BACKEND_PORT_PIDS"
        exit 1
    fi
fi

echo "正在启动后端API服务 (端口 5001)..."
LEADS_RAW_DB_PATH="$LEADS_DB" LEADS_AUTH_DB_PATH="${LEADS_AUTH_DB_PATH:-$PWD/data/leads_auth.db}" python3 backend/app_v2.py &
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
