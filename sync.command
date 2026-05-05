#!/bin/bash

# 线索运营监控系统 - 一键同步脚本

echo "=========================================="
echo "   线索运营监控系统 - 代码同步"
echo "=========================================="

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "📁 当前目录: $SCRIPT_DIR"
echo ""

# 检查git状态
echo "🔍 检查git状态..."
if [ ! -d ".git" ]; then
    echo "❌ 错误：当前目录不是git仓库！"
    exit 1
fi

# 添加所有变更
echo ""
echo "➕ 添加变更..."
git add .

# 获取提交信息
echo ""
echo "📝 请输入提交信息 (默认为 'Update code'):"
read -p "> " commit_msg
if [ -z "$commit_msg" ]; then
    commit_msg="Update code"
fi

# 提交
echo ""
echo "💾 提交变更..."
git commit -m "$commit_msg"

# 推送到远程
echo ""
echo "🚀 推送到远程仓库..."
git push -u origin main

echo ""
echo "=========================================="
echo "✅ 同步完成！"
echo "=========================================="
