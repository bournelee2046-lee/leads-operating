#!/bin/bash
#
# 线索运营监控系统 - 部署脚本
# 使用方法: bash deploy.sh
#
# 前置条件:
#   1. 已在本地配置好 SSH 密钥登录服务器
#   2. 服务器已安装 nginx（已完成）
#   3. 服务器已配置 SSL 证书（已完成）
#

set -e

# ==========================================
# 配置区 - 请根据实际情况修改
# ==========================================
SERVER_IP="47.93.60.67"
SERVER_USER="root"
PROJECT_DIR="/home/leads-system/leads-operating"
SERVER_DB_PATH="/home/leads-system/leads.db"

# 本地路径
LOCAL_PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DB_PATH="$(cd "$LOCAL_PROJECT_DIR/.." && pwd)/leads.db"
LOCAL_NGINX_CONF="$HOME/Desktop/leads-system.conf"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==========================================
# 步骤 0: 环境检查
# ==========================================
check_env() {
    echo ""
    echo "=========================================="
    echo "  步骤 0/8: 环境检查"
    echo "=========================================="
    echo ""

    # 检查 rsync
    if ! command -v rsync &>/dev/null; then
        log_warn "未检测到 rsync，正在安装..."
        brew install rsync
    fi
    log_ok "rsync 已就绪"

    # 检查 SSH 连接
    log_info "测试 SSH 连接到 $SERVER_IP ..."
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER_USER@$SERVER_IP" "echo connected" &>/dev/null; then
        log_error "SSH 连接失败！请确保已配置 SSH 密钥登录。"
        log_info "配置方法: ssh-copy-id $SERVER_USER@$SERVER_IP"
        exit 1
    fi
    log_ok "SSH 连接正常"

    # 检查本地数据库文件
    if [ ! -f "$LOCAL_DB_PATH" ]; then
        log_warn "本地数据库文件未在默认路径找到: $LOCAL_DB_PATH"
        log_info "请手动输入 leads.db 的完整路径:"
        read -r LOCAL_DB_PATH
        if [ ! -f "$LOCAL_DB_PATH" ]; then
            log_error "文件不存在，退出部署"
            exit 1
        fi
    fi
    log_ok "数据库文件: $LOCAL_DB_PATH ($(du -h "$LOCAL_DB_PATH" | cut -f1))"
}

# ==========================================
# 步骤 1: 创建服务器目录结构
# ==========================================
create_dirs() {
    echo ""
    echo "=========================================="
    echo "  步骤 1/8: 创建服务器目录结构"
    echo "=========================================="
    echo ""

    ssh "$SERVER_USER@$SERVER_IP" "mkdir -p $PROJECT_DIR/data $PROJECT_DIR/backend $PROJECT_DIR/scripts $PROJECT_DIR/src"

    log_ok "目录结构已创建: $PROJECT_DIR"
}

# ==========================================
# 步骤 2: 上传项目文件
# ==========================================
upload_project() {
    echo ""
    echo "=========================================="
    echo "  步骤 2/8: 上传项目文件 (~600MB)"
    echo "=========================================="
    echo ""

    log_info "检查服务器上 rsync 是否可用..."
    if ! ssh "$SERVER_USER@$SERVER_IP" "command -v rsync &>/dev/null"; then
        log_info "服务器未安装 rsync，正在安装..."
        ssh "$SERVER_USER@$SERVER_IP" "yum install -y rsync --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || yum install -y rsync"
    fi
    log_ok "服务器 rsync 已就绪"

    log_info "开始上传项目文件（排除 node_modules, .git, venv, dist 等）..."

    rsync -avz --progress \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='dist' \
        --exclude='.DS_Store' \
        --exclude='package-lock.json' \
        -e ssh \
        "$LOCAL_PROJECT_DIR/" \
        "$SERVER_USER@$SERVER_IP:$PROJECT_DIR/"

    log_ok "项目文件上传完成"
}

# ==========================================
# 步骤 3: 上传数据库文件
# ==========================================
upload_database() {
    echo ""
    echo "=========================================="
    echo "  步骤 3/8: 上传数据库文件 (~2.6GB)"
    echo "=========================================="
    echo ""
    log_warn "数据库文件较大，上传可能需要 5-10 分钟..."
    log_info "开始上传: $LOCAL_DB_PATH"

    log_info "检查服务器上 rsync 是否可用..."
    if ! ssh "$SERVER_USER@$SERVER_IP" "command -v rsync &>/dev/null"; then
        log_info "服务器未安装 rsync，正在安装..."
        ssh "$SERVER_USER@$SERVER_IP" "yum install -y rsync --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || yum install -y rsync"
    fi
    log_ok "服务器 rsync 已就绪"

    rsync -avz --progress \
        -e ssh \
        "$LOCAL_DB_PATH" \
        "$SERVER_USER@$SERVER_IP:$SERVER_DB_PATH"

    log_ok "数据库文件上传完成"
}

# ==========================================
# 步骤 4: 上传 Nginx 配置文件
# ==========================================
upload_nginx_config() {
    echo ""
    echo "=========================================="
    echo "  步骤 4/8: 上传 Nginx 配置文件"
    echo "=========================================="
    echo ""

    log_info "上传更新后的 Nginx 配置..."
    scp "$LOCAL_NGINX_CONF" "$SERVER_USER@$SERVER_IP:/etc/nginx/conf.d/leads-system.conf"

    log_ok "Nginx 配置已上传"
}

# ==========================================
# 步骤 5: 服务器端 - 安装系统依赖
# ==========================================
install_dependencies() {
    echo ""
    echo "=========================================="
    echo "  步骤 5/8: 安装系统依赖（服务器端）"
    echo "=========================================="
    echo ""

    log_info "检查并安装 Python 3.11, Node.js 等依赖..."

    ssh "$SERVER_USER@$SERVER_IP" bash << 'REMOTE'
        set -e

        # Python 3.11（用于支持 Flask 3.0+ / DuckDB 等）
        if ! command -v python3.11 &>/dev/null; then
            echo "[INFO] 安装 python3.11..."
            yum install -y python3.11 python3.11-devel python3.11-pip --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || yum install -y python3.11 python3.11-devel python3.11-pip
        fi
        echo "[OK] python3.11: $(python3.11 --version)"

        # Node.js 18+ (通过 NodeSource)
        if ! command -v node &>/dev/null || [ "$(node --version | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
            echo "[INFO] 安装 Node.js 18..."
            curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
            yum install -y nodejs --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || yum install -y nodejs
        fi
        echo "[OK] node: $(node --version)"
        echo "[OK] npm: $(npm --version)"

        # gcc 编译依赖（部分 Python 包需要）
        yum install -y gcc gcc-c++ 2>/dev/null || true
REMOTE

    log_ok "系统依赖安装完成"
}

# ==========================================
# 步骤 6: 安装 Python 依赖并构建前端
# ==========================================
build_application() {
    echo ""
    echo "=========================================="
    echo "  步骤 6/8: 安装依赖并构建应用（服务器端）"
    echo "=========================================="
    echo ""
    log_info "此步骤可能需要 3-5 分钟..."

    ssh "$SERVER_USER@$SERVER_IP" bash << 'REMOTE'
        set -e
        cd /home/leads-system/leads-operating

        # ---- Python 虚拟环境（使用 Python 3.11） ----
        echo "[INFO] 创建 Python 虚拟环境..."
        python3.11 -m venv venv
        source venv/bin/activate

        echo "[INFO] 安装 Python 依赖..."
        pip install --upgrade pip
        pip install gunicorn
        pip install -r requirements.txt

        echo "[OK] Python 依赖安装完成"

        # ---- 前端构建 ----
        echo "[INFO] 安装前端依赖..."
        npm install

        echo "[INFO] 构建前端..."
        npm run build

        echo "[OK] 前端构建完成 (dist/)"

        # ---- 创建 DuckDB 数据目录 ----
        mkdir -p data
        echo "[OK] 数据目录已就绪"
REMOTE

    log_ok "应用构建完成"
}

# ==========================================
# 步骤 7: 配置系统服务
# ==========================================
configure_services() {
    echo ""
    echo "=========================================="
    echo "  步骤 7/8: 配置系统服务"
    echo "=========================================="
    echo ""

    # 创建 WSGI 入口文件
    log_info "创建 Gunicorn WSGI 入口..."

    ssh "$SERVER_USER@$SERVER_IP" bash << 'REMOTE'
        set -e
        cd /home/leads-system/leads-operating

        # 创建 wsgi.py
        cat > wsgi.py << 'WSGI'
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from backend.app_v2 import app

if __name__ == "__main__":
    app.run()
WSGI

        echo "[OK] wsgi.py 已创建"
REMOTE

    # 创建 systemd 服务
    log_info "创建 systemd 服务..."

    ssh "$SERVER_USER@$SERVER_IP" bash << 'REMOTE'
        set -e

        cat > /etc/systemd/system/leads-backend.service << 'SERVICE'
[Unit]
Description=Leads Operating Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/leads-system/leads-operating
Environment=PYTHONPATH=/home/leads-system/leads-operating
ExecStart=/home/leads-system/leads-operating/venv/bin/gunicorn -w 2 -b 127.0.0.1:5001 --timeout 120 wsgi:app
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

        systemctl daemon-reload
        echo "[OK] systemd 服务已创建"
REMOTE

    # 更新 Nginx 配置并重载
    log_info "重载 Nginx..."
    ssh "$SERVER_USER@$SERVER_IP" "nginx -t && systemctl reload nginx"
    log_ok "Nginx 配置验证通过并已重载"

    log_ok "服务配置完成"
}

# ==========================================
# 步骤 8: 启动并验证
# ==========================================
start_and_verify() {
    echo ""
    echo "=========================================="
    echo "  步骤 8/8: 启动服务并验证"
    echo "=========================================="
    echo ""

    log_info "启动后端服务（首次启动会初始化 DuckDB，可能需要 1-2 分钟）..."

    ssh "$SERVER_USER@$SERVER_IP" "systemctl enable leads-backend && systemctl restart leads-backend"

    log_info "等待服务启动..."
    sleep 5

    # 检查服务状态
    echo ""
    ssh "$SERVER_USER@$SERVER_IP" "systemctl status leads-backend --no-pager"

    # 验证 API 是否正常
    echo ""
    log_info "验证 API 健康检查..."
    sleep 3
    HTTP_CODE=$(ssh "$SERVER_USER@$SERVER_IP" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/api/health" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        log_ok "API 服务正常 (HTTP $HTTP_CODE)"
    else
        log_warn "API 返回 HTTP $HTTP_CODE，可能需要检查日志"
        log_info "查看日志: ssh $SERVER_USER@$SERVER_IP 'journalctl -u leads-backend -n 50 --no-pager'"
    fi

    # 验证前端
    sleep 2
    log_info "验证前端访问..."
    FRONTEND_CODE=$(ssh "$SERVER_USER@$SERVER_IP" "curl -s -o /dev/null -w '%{http_code}' https://www.autosevice.xyz" 2>/dev/null || echo "000")

    if [ "$FRONTEND_CODE" = "200" ] || [ "$FRONTEND_CODE" = "302" ] || [ "$FRONTEND_CODE" = "301" ]; then
        log_ok "前端访问正常 (HTTP $FRONTEND_CODE)"
    else
        log_warn "前端返回 HTTP $FRONTEND_CODE，部署可能未完全就绪"
    fi
}

# ==========================================
# 完成
# ==========================================
show_summary() {
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""
    echo -e "  访问地址: ${GREEN}https://www.autosevice.xyz${NC}"
    echo ""
    echo "  常用命令:"
    echo "    查看后端日志: ssh $SERVER_USER@$SERVER_IP 'journalctl -u leads-backend -n 100 -f'"
    echo "    重启后端:     ssh $SERVER_USER@$SERVER_IP 'systemctl restart leads-backend'"
    echo "    停止后端:     ssh $SERVER_USER@$SERVER_IP 'systemctl stop leads-backend'"
    echo "    查看 Nginx 日志: ssh $SERVER_USER@$SERVER_IP 'tail -f /var/log/nginx/leads-*.log'"
    echo ""
    echo "  数据同步:"
    echo "    当本地 leads.db 更新后，运行以下命令同步到服务器:"
    echo '    rsync -avz --progress -e ssh ~/Desktop/线索运营/leads.db root@47.93.60.67:/home/leads-system/leads.db'
    echo "    ssh $SERVER_USER@$SERVER_IP 'systemctl restart leads-backend'"
    echo ""
    echo "  后续安全加固建议:"
    echo "    1. 添加账号密码登录功能"
    echo "    2. 配置防火墙（仅开放 80/443 端口）"
    echo "    3. 数据库文件加密存储"
    echo "    4. 定期备份数据库"
    echo "=========================================="
}

# ==========================================
# 主流程
# ==========================================
main() {
    echo ""
    echo -e "${GREEN}==========================================${NC}"
    echo -e "${GREEN}  线索运营监控系统 - 一键部署脚本${NC}"
    echo -e "${GREEN}==========================================${NC}"
    echo ""
    echo -e "  服务器:     ${YELLOW}$SERVER_IP${NC}"
    echo -e "  项目目录:   ${YELLOW}$PROJECT_DIR${NC}"
    echo -e "  数据库路径: ${YELLOW}$SERVER_DB_PATH${NC}"
    echo -e "  访问域名:   ${YELLOW}https://www.autosevice.xyz${NC}"
    echo ""
    echo -e "${RED}  请确保已先退出服务器 SSH 连接，在本机终端执行！${NC}"
    echo ""
    read -p "按回车键开始部署，或 Ctrl+C 取消..."

    check_env
    create_dirs
    upload_project
    upload_database
    upload_nginx_config
    install_dependencies
    build_application
    configure_services
    start_and_verify
    show_summary
}

main "$@"
