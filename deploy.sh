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
SERVER_USER="${SERVER_USER:-deploy}"
SERVICE_USER="${SERVICE_USER:-leadsapp}"
GUNICORN_WORKERS="${GUNICORN_WORKERS:-1}"
GUNICORN_THREADS="${GUNICORN_THREADS:-2}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-360}"
INIT_CLOUD_RELEASE="${INIT_CLOUD_RELEASE:-false}"
PROJECT_DIR="/home/leads-system/leads-operating"
SERVER_DB_PATH="/home/leads-system/leads.db"
SERVER_AUTH_DB_PATH="$PROJECT_DIR/data/leads_auth.db"
SERVER_DUCKDB_PATH="$PROJECT_DIR/data/leads_analytics.db"
SERVER_GOVERNANCE_DB_PATH="$PROJECT_DIR/data/store_governance.db"
SERVER_ENV_DIR="/etc/leads-operating"
SERVER_BACKEND_ENV_PATH="$SERVER_ENV_DIR/backend.env"
LEADS_CORS_ORIGINS="${LEADS_CORS_ORIGINS:-https://www.autosevice.xyz,https://autosevice.xyz}"

# 本地路径
LOCAL_PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DB_PATH="$(cd "$LOCAL_PROJECT_DIR/.." && pwd)/leads.db"

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

remote_sudo() {
    if [ "$SERVER_USER" = "root" ]; then
        printf ""
    else
        printf "sudo"
    fi
}

write_systemd_env_line() {
    local key="$1"
    local value="$2"

    if [[ "$value" == *$'\n'* ]] || [[ "$value" == *$'\r'* ]]; then
        log_error "$key 不能包含换行符。"
        exit 1
    fi

    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    printf '%s="%s"\n' "$key" "$value"
}

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

    if [ "$SERVER_USER" = "root" ] && [ "${ALLOW_ROOT_DEPLOY:-false}" != "true" ]; then
        log_error "当前配置会直接使用 root 部署。若确需 root，请显式设置 ALLOW_ROOT_DEPLOY=true。"
        exit 1
    fi

    if [ -z "${LEADS_SECRET_KEY:-}" ] || [ "$LEADS_SECRET_KEY" = "dev-secret-key-change-in-production" ]; then
        log_error "生产部署必须设置 LEADS_SECRET_KEY，且不能使用开发默认密钥。"
        log_info "可先生成密钥: python3 -c \"import secrets; print(secrets.token_urlsafe(48))\""
        log_info "再执行: LEADS_SECRET_KEY=\"生成的密钥\" LEADS_DEFAULT_ADMIN_PASSWORD=\"强密码\" bash deploy.sh"
        exit 1
    fi

    if [ -z "${LEADS_DEFAULT_ADMIN_PASSWORD:-}" ] || [ "$LEADS_DEFAULT_ADMIN_PASSWORD" = "Admin@123456" ]; then
        log_error "生产部署必须设置 LEADS_DEFAULT_ADMIN_PASSWORD，且不能使用默认密码 Admin@123456。"
        exit 1
    fi

    # 初始化云端发布不上传本地数据库，避免把本地测试数据同步到云端。
    if [ "$INIT_CLOUD_RELEASE" = "true" ]; then
        log_warn "INIT_CLOUD_RELEASE=true：本次只发布初始化版本，不上传本地 leads.db 或治理数据。"
        return
    fi

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

    REMOTE_SUDO="$(remote_sudo)"
    ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO mkdir -p $PROJECT_DIR/data $PROJECT_DIR/backend $PROJECT_DIR/scripts $PROJECT_DIR/src && $REMOTE_SUDO setfacl -m u:$SERVER_USER:rwX /home/leads-system 2>/dev/null || true && $REMOTE_SUDO setfacl -R -m u:$SERVER_USER:rwX $PROJECT_DIR 2>/dev/null || true"

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
        REMOTE_SUDO="$(remote_sudo)"
        ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO yum install -y rsync --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || $REMOTE_SUDO yum install -y rsync"
    fi
    log_ok "服务器 rsync 已就绪"

    log_info "开始上传项目文件（排除 node_modules, .git, venv, dist 等）..."

    rsync -avz --progress \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='*.log' \
        --exclude='*.pid' \
        --exclude='*.xlsx' \
        --exclude='*.xls' \
        --exclude='*.csv' \
        --exclude='dist' \
        --exclude='.DS_Store' \
        --exclude='package-lock.json' \
        --exclude='artifacts' \
        --exclude='outputs' \
        --exclude='prototypes' \
        --exclude='线索导入工具' \
        --exclude='*.db' \
        --exclude='*.sqlite' \
        --exclude='*.sqlite3' \
        --exclude='*.db-wal' \
        --exclude='*.db-shm' \
        --exclude='*.wal' \
        --exclude='*.tmp' \
        --exclude='data/*.db*' \
        -e ssh \
        "$LOCAL_PROJECT_DIR/" \
        "$SERVER_USER@$SERVER_IP:$PROJECT_DIR/"

    if [ "$INIT_CLOUD_RELEASE" = "true" ]; then
        log_info "清理服务器项目目录中的本地测试/临时产物..."
        ssh "$SERVER_USER@$SERVER_IP" "PROJECT_DIR='$PROJECT_DIR' bash" << 'REMOTE'
            set -e
            cd "$PROJECT_DIR"
            rm -rf artifacts outputs prototypes "线索导入工具"
            find . -maxdepth 2 -type f \( \
                -name '*.log' -o \
                -name '*.pid' -o \
                -name '*.xlsx' -o \
                -name '*.xls' -o \
                -name '*.csv' \
            \) -delete
REMOTE
        log_ok "服务器测试/临时产物已清理"
    fi

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
    if [ "$INIT_CLOUD_RELEASE" = "true" ]; then
        log_warn "初始化云端发布：跳过本地 leads.db 上传，并在服务器创建空业务库。"
        REMOTE_SUDO="$(remote_sudo)"
        ssh "$SERVER_USER@$SERVER_IP" "REMOTE_SUDO='$REMOTE_SUDO' SERVER_DB_PATH='$SERVER_DB_PATH' SERVER_AUTH_DB_PATH='$SERVER_AUTH_DB_PATH' SERVER_DUCKDB_PATH='$SERVER_DUCKDB_PATH' SERVER_GOVERNANCE_DB_PATH='$SERVER_GOVERNANCE_DB_PATH' bash" << 'REMOTE'
            set -e
            timestamp="$(date +%Y%m%d%H%M%S)"

            for db_path in "$SERVER_DB_PATH" "$SERVER_AUTH_DB_PATH" "$SERVER_DUCKDB_PATH" "$SERVER_GOVERNANCE_DB_PATH" "/home/leads-system/leads_auth.db"; do
                if [ -f "$db_path" ]; then
                    $REMOTE_SUDO mv "$db_path" "$db_path.init-release-bak.$timestamp"
                fi
                $REMOTE_SUDO rm -f "$db_path-wal" "$db_path-shm" "$db_path.wal" "$db_path.tmp"
            done

            $REMOTE_SUDO mkdir -p "$(dirname "$SERVER_DB_PATH")" "$(dirname "$SERVER_DUCKDB_PATH")" "$(dirname "$SERVER_GOVERNANCE_DB_PATH")"
            tmp_db="/tmp/leads-empty.db.$$"
            sqlite3 "$tmp_db" "PRAGMA user_version=1;"
            $REMOTE_SUDO install -m 0644 "$tmp_db" "$SERVER_DB_PATH"
            rm -f "$tmp_db"
REMOTE
        log_ok "服务器已准备初始化空库，不包含本地测试数据"
        return
    fi

    log_warn "数据库文件较大，上传可能需要 5-10 分钟..."
    log_info "开始上传: $LOCAL_DB_PATH"

    log_info "检查服务器上 rsync 是否可用..."
    if ! ssh "$SERVER_USER@$SERVER_IP" "command -v rsync &>/dev/null"; then
        log_info "服务器未安装 rsync，正在安装..."
        REMOTE_SUDO="$(remote_sudo)"
        ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO yum install -y rsync --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || $REMOTE_SUDO yum install -y rsync"
    fi
    log_ok "服务器 rsync 已就绪"

    rsync -avz --progress \
        -e ssh \
        "$LOCAL_DB_PATH" \
        "$SERVER_USER@$SERVER_IP:/tmp/leads.db.upload"

    REMOTE_SUDO="$(remote_sudo)"
    ssh "$SERVER_USER@$SERVER_IP" "REMOTE_SUDO='$REMOTE_SUDO' SERVER_DB_PATH='$SERVER_DB_PATH' SERVER_DUCKDB_PATH='$SERVER_DUCKDB_PATH' bash" << 'REMOTE'
        set -e
        $REMOTE_SUDO sqlite3 /tmp/leads.db.upload 'PRAGMA quick_check;'
        timestamp="$(date +%Y%m%d%H%M%S)"
        if [ -f "$SERVER_DB_PATH" ]; then
            $REMOTE_SUDO cp -a "$SERVER_DB_PATH" "$SERVER_DB_PATH.deploy-bak.$timestamp"
        fi
        $REMOTE_SUDO install -m 0644 /tmp/leads.db.upload "$SERVER_DB_PATH"
        rm -f /tmp/leads.db.upload

        # SQLite 源库更新后，移走旧 DuckDB 分析库，避免物化表继续读取旧数据。
        if [ -f "$SERVER_DUCKDB_PATH" ]; then
            $REMOTE_SUDO mv "$SERVER_DUCKDB_PATH" "$SERVER_DUCKDB_PATH.deploy-bak.$timestamp"
        fi
        $REMOTE_SUDO rm -f "$SERVER_DUCKDB_PATH.wal" "$SERVER_DUCKDB_PATH.tmp"
        if [ -x /usr/local/sbin/leads-prune-db-backups ]; then
            $REMOTE_SUDO /usr/local/sbin/leads-prune-db-backups 2
        elif [ -x /home/leads-system/leads-operating/scripts/prune_db_backups.sh ]; then
            $REMOTE_SUDO /home/leads-system/leads-operating/scripts/prune_db_backups.sh 2
        fi
REMOTE

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

    local nginx_conf
    nginx_conf="$(mktemp)"
    cat > "$nginx_conf" <<'NGINX'
# HTTP 强制跳转到 HTTPS
server {
    listen 80;
    server_name www.autosevice.xyz autosevice.xyz;
    return 301 https://www.autosevice.xyz$request_uri;
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name www.autosevice.xyz autosevice.xyz;

    ssl_certificate /etc/nginx/ssl/www.autosevice.xyz.pem;
    ssl_certificate_key /etc/nginx/ssl/www.autosevice.xyz.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml;

    location / {
        root /home/leads-system/leads-operating/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    access_log /var/log/nginx/leads-access.log;
    error_log /var/log/nginx/leads-error.log;
}
NGINX

    log_info "上传更新后的 Nginx 配置..."
    scp "$nginx_conf" "$SERVER_USER@$SERVER_IP:/tmp/leads-system.conf"
    rm -f "$nginx_conf"
    REMOTE_SUDO="$(remote_sudo)"
    ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO install -m 0644 /tmp/leads-system.conf /etc/nginx/conf.d/leads-system.conf && rm -f /tmp/leads-system.conf"

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
            sudo yum install -y python3.11 python3.11-devel python3.11-pip --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || sudo yum install -y python3.11 python3.11-devel python3.11-pip
        fi
        echo "[OK] python3.11: $(python3.11 --version)"

        # Node.js 18+ (通过 NodeSource)
        if ! command -v node &>/dev/null || [ "$(node --version | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
            echo "[INFO] 安装 Node.js 18..."
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs --disablerepo=docker-ce-stable --disablerepo=google-chrome 2>/dev/null || sudo yum install -y nodejs
        fi
        echo "[OK] node: $(node --version)"
        echo "[OK] npm: $(npm --version)"

        # gcc 编译依赖（部分 Python 包需要）
        sudo yum install -y gcc gcc-c++ 2>/dev/null || true
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

        # ---- 创建 DuckDB 数据目录 ----
        mkdir -p data
        echo "[OK] 数据目录已就绪"

        # ---- 迁移/保留账号权限库 ----
        if [ ! -f "data/leads_auth.db" ] && [ -f "/home/leads-system/leads_auth.db" ]; then
            echo "[INFO] 发现旧权限库 /home/leads-system/leads_auth.db，迁移到 data/leads_auth.db ..."
            cp /home/leads-system/leads_auth.db data/leads_auth.db
            echo "[OK] 权限库迁移完成"
        elif [ ! -f "data/leads_auth.db" ]; then
            echo "[INFO] 未发现权限库，首次启动时将自动初始化 data/leads_auth.db"
        else
            echo "[OK] 保留现有权限库 data/leads_auth.db"
        fi
REMOTE

    if [ "$INIT_CLOUD_RELEASE" = "true" ]; then
        log_info "初始化发布使用本地 dist，避免云服务器小内存构建失败..."
        if [ ! -f "$LOCAL_PROJECT_DIR/dist/index.html" ]; then
            log_info "本地 dist 不存在，先在本机执行 npm run build..."
            (cd "$LOCAL_PROJECT_DIR" && npm run build)
        fi
        rsync -avz --delete -e ssh "$LOCAL_PROJECT_DIR/dist/" "$SERVER_USER@$SERVER_IP:$PROJECT_DIR/dist/"
        log_ok "本地前端构建产物已上传到服务器 dist/"
    else
        ssh "$SERVER_USER@$SERVER_IP" bash << 'REMOTE'
            set -e
            cd /home/leads-system/leads-operating

            echo "[INFO] 安装前端依赖..."
            npm install

            echo "[INFO] 构建前端..."
            npm run build

            echo "[OK] 前端构建完成 (dist/)"
REMOTE
    fi

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

    # 验证 WSGI 入口文件。wsgi.py 随项目上传，不能在部署时重写，否则会丢失初始化逻辑。
    log_info "验证 Gunicorn WSGI 入口..."

    ssh "$SERVER_USER@$SERVER_IP" bash << 'REMOTE'
        set -e
        cd /home/leads-system/leads-operating

        test -f wsgi.py
        grep -q "init_system" wsgi.py
        grep -q "metadata_registry.initialize" wsgi.py
        echo "[OK] wsgi.py 已存在且包含初始化逻辑"
REMOTE

    # 创建 systemd 服务
    log_info "创建 systemd 服务..."

    local backend_env_file
    backend_env_file="$(mktemp)"
    {
        write_systemd_env_line "PYTHONPATH" "/home/leads-system/leads-operating"
        write_systemd_env_line "HOME" "/home/leads-system"
        write_systemd_env_line "FLASK_ENV" "production"
        write_systemd_env_line "FLASK_DEBUG" "false"
        write_systemd_env_line "LEADS_SECRET_KEY" "$LEADS_SECRET_KEY"
        write_systemd_env_line "LEADS_DEFAULT_ADMIN_PASSWORD" "$LEADS_DEFAULT_ADMIN_PASSWORD"
        write_systemd_env_line "LEADS_CORS_ORIGINS" "$LEADS_CORS_ORIGINS"
        write_systemd_env_line "LEADS_RAW_DB_PATH" "$SERVER_DB_PATH"
        write_systemd_env_line "LEADS_AUTH_DB_PATH" "$SERVER_AUTH_DB_PATH"
        write_systemd_env_line "LEADS_DUCKDB_PATH" "$SERVER_DUCKDB_PATH"
        write_systemd_env_line "STORE_GOVERNANCE_DB_PATH" "$SERVER_GOVERNANCE_DB_PATH"
        write_systemd_env_line "LEADS_SESSION_COOKIE_SECURE" "true"
    } > "$backend_env_file"
    scp "$backend_env_file" "$SERVER_USER@$SERVER_IP:/tmp/leads-backend.env"
    rm -f "$backend_env_file"

    ssh "$SERVER_USER@$SERVER_IP" "SERVICE_USER='$SERVICE_USER' GUNICORN_WORKERS='$GUNICORN_WORKERS' GUNICORN_THREADS='$GUNICORN_THREADS' GUNICORN_TIMEOUT='$GUNICORN_TIMEOUT' SERVER_ENV_DIR='$SERVER_ENV_DIR' SERVER_BACKEND_ENV_PATH='$SERVER_BACKEND_ENV_PATH' bash" << 'REMOTE'
        set -e

        if ! id "$SERVICE_USER" >/dev/null 2>&1; then
            sudo useradd --system --home-dir /home/leads-system --shell /sbin/nologin "$SERVICE_USER"
        fi
        sudo mkdir -p /home/leads-system/.gunicorn
        sudo install -d -m 0750 "$SERVER_ENV_DIR"
        sudo install -m 0600 -o root -g root /tmp/leads-backend.env "$SERVER_BACKEND_ENV_PATH"
        rm -f /tmp/leads-backend.env
        sudo setfacl -m "u:$SERVICE_USER:rwX" /home/leads-system /home/leads-system/leads.db 2>/dev/null || true
        sudo setfacl -R -m "u:$SERVICE_USER:rwX" /home/leads-system/.gunicorn /home/leads-system/leads-operating 2>/dev/null || true

        sudo tee /etc/systemd/system/leads-backend.service >/dev/null << SERVICE
[Unit]
Description=Leads Operating Backend
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=/home/leads-system/leads-operating
EnvironmentFile=$SERVER_BACKEND_ENV_PATH
ExecStart=/home/leads-system/leads-operating/venv/bin/gunicorn -w $GUNICORN_WORKERS --threads $GUNICORN_THREADS -b 127.0.0.1:5001 --timeout $GUNICORN_TIMEOUT wsgi:app
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

        sudo systemctl daemon-reload
        echo "[OK] systemd 服务已创建，敏感配置已写入 $SERVER_BACKEND_ENV_PATH"
REMOTE

    # 更新 Nginx 配置并重载
    log_info "重载 Nginx..."
    REMOTE_SUDO="$(remote_sudo)"
    ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO nginx -t && $REMOTE_SUDO systemctl reload nginx"
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

    REMOTE_SUDO="$(remote_sudo)"
    ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO systemctl enable leads-backend && $REMOTE_SUDO systemctl restart leads-backend"

    log_info "等待服务启动..."
    sleep 5

    # 检查服务状态
    echo ""
    ssh "$SERVER_USER@$SERVER_IP" "$REMOTE_SUDO systemctl status leads-backend --no-pager"

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
    echo "    查看后端日志: ssh $SERVER_USER@$SERVER_IP 'sudo journalctl -u leads-backend -n 100 -f'"
    echo "    重启后端:     ssh $SERVER_USER@$SERVER_IP 'sudo systemctl restart leads-backend'"
    echo "    停止后端:     ssh $SERVER_USER@$SERVER_IP 'sudo systemctl stop leads-backend'"
    echo "    查看 Nginx 日志: ssh $SERVER_USER@$SERVER_IP 'sudo tail -f /var/log/nginx/leads-*.log'"
    echo ""
    echo "  数据同步:"
    echo "    当本地 leads.db 更新后，运行以下命令同步到服务器:"
    echo "    bash deploy.sh"
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
    echo -e "  权限库路径: ${YELLOW}$SERVER_AUTH_DB_PATH${NC}"
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
