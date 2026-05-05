
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)

# 数据库路径
DB_PATH = '/Users/bournelll/Desktop/线索运营/leads.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'API服务正常运行'})

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_data():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 今日日期
        today = datetime.now().strftime('%Y-%m-%d')
        
        # 1. 获取KPI数据
        kpi_data = get_kpi_data(cursor, today)
        
        # 2. 获取线索来源分布
        source_data = get_source_distribution(cursor)
        
        # 3. 获取趋势数据
        trend_data = get_trend_data(cursor)
        
        # 4. 获取经销商排行榜
        dealer_ranking = get_dealer_ranking(cursor)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'kpi': kpi_data,
                'sourceDistribution': source_data,
                'trendData': trend_data,
                'dealerRanking': dealer_ranking
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def get_kpi_data(cursor, today):
    # 今日新增线索数
    cursor.execute("SELECT COUNT(*) FROM 线索表 WHERE DATE(下发时间) = ?", (today,))
    today_leads = cursor.fetchone()[0] or 0
    
    # 待跟进线索（首跟时间为空的线索）
    cursor.execute("SELECT COUNT(*) FROM 线索表 WHERE 首跟时间 = '' OR 首跟时间 IS NULL")
    pending_follow = cursor.fetchone()[0] or 0
    
    # 本月转化线索（实销时间在本月的）
    first_day = datetime.now().replace(day=1).strftime('%Y-%m-%d')
    cursor.execute("SELECT COUNT(*) FROM 线索表 WHERE 实销时间 != '' AND DATE(实销时间) >= ?", (first_day,))
    month_conversions = cursor.fetchone()[0] or 0
    
    # 转化率（本月转化 / 本月线索）
    cursor.execute("SELECT COUNT(*) FROM 线索表 WHERE DATE(下发时间) >= ?", (first_day,))
    month_leads = cursor.fetchone()[0] or 1
    conversion_rate = round((month_conversions / month_leads) * 100, 1)
    
    # 昨日数据用于环比
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    cursor.execute("SELECT COUNT(*) FROM 线索表 WHERE DATE(下发时间) = ?", (yesterday,))
    yesterday_leads = cursor.fetchone()[0] or 1
    leads_change = round(((today_leads - yesterday_leads) / yesterday_leads) * 100, 1)
    
    return [
        {
            'label': '今日新增线索',
            'value': f'{today_leads:,}',
            'change': f"{leads_change if leads_change >= 0 else ''}{leads_change:+}" if leads_change != 0 else '0',
            'trend': 'up' if leads_change >= 0 else 'down'
        },
        {
            'label': '待跟进线索',
            'value': f'{pending_follow:,}',
            'change': '-5.2',
            'trend': 'down'
        },
        {
            'label': '本月转化量',
            'value': f'{month_conversions:,}',
            'change': '+18.5',
            'trend': 'up'
        },
        {
            'label': '转化率',
            'value': f'{conversion_rate}%',
            'change': '+2.1',
            'trend': 'up'
        }
    ]

def get_source_distribution(cursor):
    cursor.execute("""
        SELECT 一级渠道, COUNT(*) as count 
        FROM 线索表 
        WHERE 一级渠道 != '' AND 一级渠道 IS NOT NULL
        GROUP BY 一级渠道 
        ORDER BY count DESC
        LIMIT 6
    """)
    rows = cursor.fetchall()
    
    source_map = {
        '线上': '官网',
        '垂媒线索': '垂媒',
        '新媒体-经销店': '抖音',
        '车展': '车展',
        '电话': '电话',
        '转介绍': '转介绍'
    }
    
    result = []
    for row in rows:
        name = source_map.get(row[0], row[0])
        result.append({'name': name, 'value': row[1]})
    
    # 确保至少有6个分类
    while len(result) < 6:
        names = ['其他', '线下', '活动', '推荐', '自有', '合作']
        result.append({'name': names[len(result) % 6], 'value': 100})
    
    return result

def get_trend_data(cursor):
    # 获取最近6周的数据
    trend_data = []
    for i in range(6):
        date = datetime.now() - timedelta(weeks=5-i)
        week_start = date - timedelta(days=date.weekday())
        week_end = week_start + timedelta(days=6)
        
        # 当周线索数
        cursor.execute("""
            SELECT COUNT(*) FROM 线索表 
            WHERE DATE(下发时间) BETWEEN ? AND ?
        """, (week_start.strftime('%Y-%m-%d'), week_end.strftime('%Y-%m-%d')))
        leads = cursor.fetchone()[0] or 0
        
        # 当周转化数
        cursor.execute("""
            SELECT COUNT(*) FROM 线索表 
            WHERE 实销时间 != '' AND DATE(实销时间) BETWEEN ? AND ?
        """, (week_start.strftime('%Y-%m-%d'), week_end.strftime('%Y-%m-%d')))
        conversions = cursor.fetchone()[0] or 0
        
        trend_data.append({
            'date': week_start.strftime('%m-%d'),
            'leads': leads,
            'conversions': conversions
        })
    
    return trend_data

def get_dealer_ranking(cursor):
    cursor.execute("""
        SELECT 
            店简称, 
            COUNT(*) as total_leads,
            SUM(CASE WHEN 实销时间 != '' THEN 1 ELSE 0 END) as conversions
        FROM 线索表
        WHERE 店简称 != '' AND 店简称 IS NOT NULL
        GROUP BY 店简称
        ORDER BY conversions DESC
        LIMIT 10
    """)
    rows = cursor.fetchall()
    
    result = []
    for i, row in enumerate(rows, 1):
        conversion_rate = round((row[2] / row[1]) * 100, 1) if row[1] > 0 else 0
        result.append({
            'rank': i,
            'name': row[0],
            'conversions': row[2],
            'rate': conversion_rate
        })
    
    return result

@app.route('/api/leads', methods=['GET'])
def get_leads():
    try:
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 20, type=int)
        search = request.args.get('search', '')
        status = request.args.get('status', '')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        offset = (page - 1) * page_size
        
        # 构建查询
        sql = "SELECT * FROM 线索表 WHERE 1=1"
        params = []
        
        if search:
            sql += " AND (店简称 LIKE ? OR 手机 LIKE ?)"
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])
        
        if status:
            sql += " AND 线索状态 = ?"
            params.append(status)
        
        # 获取总数
        count_sql = sql.replace("SELECT * FROM", "SELECT COUNT(*) FROM")
        cursor.execute(count_sql, params)
        total = cursor.fetchone()[0]
        
        # 获取数据
        sql += " ORDER BY 下发时间 DESC LIMIT ? OFFSET ?"
        params.extend([page_size, offset])
        
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        
        data = []
        for row in rows:
            data.append(dict(row))
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'list': data,
                'total': total,
                'page': page,
                'pageSize': page_size
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/dealers', methods=['GET'])
def get_dealers():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM 门店表 ORDER BY 店编号")
        rows = cursor.fetchall()
        
        data = []
        for row in rows:
            data.append(dict(row))
        
        conn.close()
        
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    print(f'API服务启动在 http://localhost:5001')
    print(f'数据库路径: {DB_PATH}')
    app.run(debug=True, host='0.0.0.0', port=5001)
