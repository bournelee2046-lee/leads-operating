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

# 检查远程仓库
echo ""
echo "🌐 检查远程仓库..."
if ! git remote | grep -q "origin"; then
    echo "⚠️  添加远程仓库..."
    git remote add origin https://github.com/bournelee2046-lee/leads-operating.git
fi

# 检查是否有变更
if git status | grep -q "nothing to commit, working tree clean"; then
    echo "✅ 没有变更需要提交！"
else
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
fi

# 推送到远程
echo ""
echo "🚀 推送到远程仓库..."
git push -u origin main

echo ""
echo "=========================================="
echo "✅ 同步完成！"
echo "=========================================="
echo ""
read -p "按回车键退出..."
