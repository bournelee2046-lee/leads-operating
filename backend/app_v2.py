import sys
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backend.config import Config
from backend.core.db_manager import RawDBManager
from backend.core.duckdb_manager import DuckDBManager

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# Initialize managers
raw_db = RawDBManager()
duck_db = None


def init_system(force_refresh=False):
    """初始化系统"""
    global duck_db
    print("Initializing Leads Analytics System...")
    
    duck_db = DuckDBManager()
    
    # Check if metadata exists
    data_needs_refresh = force_refresh
    if not force_refresh:
        try:
            conn = duck_db.get_connection()
            # 检查是否有最早数据时间元数据
            result = conn.execute("SELECT value FROM metadata WHERE key = 'earliest_data_time' LIMIT 1").fetchone()
            if result and result[0]:
                print("Data already initialized with full metadata!")
            else:
                print("Data missing some metadata, refreshing...")
                data_needs_refresh = True
        except Exception as e:
            print("Data not found or metadata missing, initializing...")
            data_needs_refresh = True
    
    if data_needs_refresh:
        # Initialize and load data
        duck_db.initialize()
        duck_db.load_from_sqlite()
        duck_db.compute_all_metrics()
        print("System initialized successfully!")
    else:
        print("Using existing data!")
    return True


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'success': True,
        'status': 'ok',
        'version': '2.0.0',
        'data': {
            'layers': {
                'raw': 'connected',
                'mart': 'connected',
                'metric': 'connected'
            }
        }
    })


@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    """获取仪表盘数据
    参数: period - "day" (昨日数据) or "month" (当月累计数据)
    """
    try:
        period = request.args.get('period', 'day')
        data = duck_db.get_dashboard_data(period=period)
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    """获取指标列表"""
    metrics = [
        {'name': 'lead_count', 'display_name': '线索数量', 'category': 'kpi', 'description': '统计周期内的线索总数'},
        {'name': 'conversion_rate', 'display_name': '转化率', 'category': 'kpi', 'description': '转化线索占比'},
        {'name': 'follow_in_30min_rate', 'display_name': '30分钟跟进率', 'category': 'kpi', 'description': '30分钟内跟进线索占比'},
        {'name': 'to_shop_rate', 'display_name': '到店率', 'category': 'kpi', 'description': '到店线索占比'}
    ]
    return jsonify({'success': True, 'data': metrics})


@app.route('/api/dealers', methods=['GET'])
def get_dealers():
    """获取经销商列表"""
    try:
        dealers = raw_db.get_dealers()
        return jsonify({
            'success': True,
            'data': [dict(d) for d in dealers]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/refresh/trigger', methods=['POST'])
def trigger_refresh():
    """触发数据刷新
    mode: 'full' (全量重算) | 'incremental' (增量同步新数据) | 'recompute' (仅重算指标)
    """
    try:
        data = request.get_json() or {}
        mode = data.get('mode', 'full')

        if mode == 'full':
            print("Starting full refresh...")
            duck_db.initialize()
            duck_db.load_from_sqlite()
            duck_db.compute_all_metrics()
            stats = duck_db.get_count_stats()
            print(f"Full refresh completed: {stats}")

        elif mode == 'incremental':
            print("Starting incremental sync...")
            new_count = duck_db.load_incremental()
            if new_count > 0:
                duck_db.compute_all_metrics()
                print(f"Incremental sync: {new_count} new leads added")
            else:
                print("Incremental sync: no new data found")
            stats = duck_db.get_count_stats()

        elif mode == 'recompute':
            date_str = data.get('date')
            if date_str:
                duck_db.compute_all_metrics(date_str=date_str)
            else:
                duck_db.compute_all_metrics()
            stats = duck_db.get_count_stats()
        else:
            return jsonify({
                'success': False,
                'message': f'Unknown mode: {mode}'
            }), 400

        return jsonify({
            'success': True,
            'data': {
                'task_id': 'refresh_' + datetime.now().strftime('%Y%m%d%H%M%S'),
                'status': 'completed',
                'mode': mode,
                'stats': stats
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/explore/leads', methods=['GET'])
def explore_leads():
    """探索线索数据"""
    try:
        conn = duck_db.get_connection()
        
        filters = []
        params = []
        
        dealer_id = request.args.get('dealer_id')
        if dealer_id:
            filters.append("dealer_id = ?")
            params.append(dealer_id)
        
        region = request.args.get('region')
        if region:
            filters.append("region = ?")
            params.append(region)
        
        channel_1 = request.args.get('channel_1')
        if channel_1:
            filters.append("channel_1 = ?")
            params.append(channel_1)
        
        is_converted = request.args.get('is_converted')
        if is_converted is not None:
            filters.append("is_converted = ?")
            params.append(is_converted.lower() == 'true')
        
        where_clause = " AND ".join(filters) if filters else "1=1"
        
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 20))
        offset = (page - 1) * page_size
        
        count_query = f"SELECT COUNT(*) FROM mart_leads WHERE " + where_clause
        total = conn.execute(count_query, params).fetchone()[0]
        
        query = f"""
            SELECT lead_id, dealer_id, dealer_name, region, channel_1,
                   assign_date, first_follow_date, is_converted, conversion_date
            FROM mart_leads
            WHERE {where_clause}
            ORDER BY assign_date DESC
            LIMIT ? OFFSET ?
        """
        results = conn.execute(query, params + [page_size, offset]).fetchall()
        
        return jsonify({
            'success': True,
            'data': {
                'list': [dict(zip([d[0] for d in results.description], r)) for r in results],
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total': total
                }
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/explore/aggregate', methods=['POST'])
def aggregate_data():
    """数据聚合查询"""
    try:
        data = request.get_json() or {}
        group_by = data.get('group_by', ['channel_1'])
        metrics = data.get('metrics', ['lead_count'])
        
        valid_fields = ['channel_1', 'region', 'dealer_id', 'assign_date']
        group_by = [f for f in group_by if f in valid_fields]
        
        if not group_by:
            return jsonify({'success': False, 'message': 'No valid group fields'}), 400
        
        conn = duck_db.get_connection()
        
        group_clause = ", ".join(group_by)
        select_clause = ", ".join(group_by)
        
        metric_calcs = []
        for m in metrics:
            if m == 'lead_count':
                metric_calcs.append("COUNT(*) AS lead_count")
            elif m == 'conversion_count':
                metric_calcs.append("SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS conversion_count")
            elif m == 'conversion_rate':
                metric_calcs.append("AVG(CASE WHEN is_converted THEN 1 ELSE 0 END) * 100 AS conversion_rate")
        
        if metric_calcs:
            select_clause += ", " + ", ".join(metric_calcs)
        
        filters = data.get('filters', {})
        where_parts = []
        params = []
        
        if 'start_date' in filters:
            where_parts.append("assign_date >= ?")
            params.append(filters['start_date'])
        if 'end_date' in filters:
            where_parts.append("assign_date <= ?")
            params.append(filters['end_date'])
        
        where_clause = " AND ".join(where_parts) if where_parts else "1=1"
        
        query = f"SELECT {select_clause} FROM mart_leads WHERE {where_clause} GROUP BY {group_clause}"
        results = conn.execute(query, params).fetchall()
        
        return jsonify({
            'success': True,
            'data': [dict(zip([d[0] for d in results.description], r)) for r in results]
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/follow-up/distribution', methods=['GET'])
def get_follow_up_distribution():
    """获取跟进次数分布数据
    
    统计范围：当月累计至前一天18:00前
    线索标准：一级渠道为线上且四级渠道不包含"反写"
    跟进次数标准：线索表里的"总跟进次数"字段，空值代表未跟进
    """
    try:
        from datetime import datetime, timedelta, date
        
        # 计算统计时间范围
        today = date.today()
        # 本月第一天
        month_start = date(today.year, today.month, 1)
        # 前一天18:00
        yesterday = today - timedelta(days=1)
        end_datetime = datetime(yesterday.year, yesterday.month, yesterday.day, 18, 0, 0)
        
        # 获取门店列表
        dealers = raw_db.get_dealers()
        dealer_list = [dict(d) for d in dealers]
        
        # 获取跟进次数分布数据
        with raw_db.get_connection() as conn:
            # 统计每家门店的跟进次数分布
            query = """
                SELECT 
                    d.店编号 as dealer_id,
                    d.店简称 as dealer_name,
                    d.大区 as region,
                    d.战区 as zone,
                    SUM(CASE WHEN CAST(COALESCE(NULLIF(l.总跟进次数, ''), '0') AS INTEGER) = 0 THEN 1 ELSE 0 END) as follow_0,
                    SUM(CASE WHEN CAST(COALESCE(NULLIF(l.总跟进次数, ''), '0') AS INTEGER) = 1 THEN 1 ELSE 0 END) as follow_1,
                    SUM(CASE WHEN CAST(COALESCE(NULLIF(l.总跟进次数, ''), '0') AS INTEGER) = 2 THEN 1 ELSE 0 END) as follow_2,
                    SUM(CASE WHEN CAST(COALESCE(NULLIF(l.总跟进次数, ''), '0') AS INTEGER) = 3 THEN 1 ELSE 0 END) as follow_3,
                    SUM(CASE WHEN CAST(COALESCE(NULLIF(l.总跟进次数, ''), '0') AS INTEGER) >= 4 THEN 1 ELSE 0 END) as follow_4_plus,
                    COUNT(*) as total
                FROM 门店表 d
                LEFT JOIN 线索表 l ON d.店编号 = l.门店
                WHERE 
                    l.一级渠道 = '线上'
                    AND (l.四级渠道 IS NULL OR l.四级渠道 NOT LIKE '%反写%')
                    AND l.跟进截止时间 IS NOT NULL
                    AND l.最终下发时间 >= ?
                    AND l.最终下发时间 <= ?
                GROUP BY d.店编号, d.店简称, d.大区, d.战区
                ORDER BY d.rowid
            """
            
            results = conn.execute(query, [
                month_start.strftime("%Y-%m-%d 00:00:00"),
                end_datetime.strftime("%Y-%m-%d %H:%M:%S")
            ]).fetchall()
            
            distribution_data = []
            for row in results:
                row_dict = {
                    'dealer_id': row['dealer_id'],
                    'dealer_name': row['dealer_name'],
                    'region': row['region'] or '',
                    'zone': row['zone'] or '',
                    'follow_0': row['follow_0'] or 0,
                    'follow_1': row['follow_1'] or 0,
                    'follow_2': row['follow_2'] or 0,
                    'follow_3': row['follow_3'] or 0,
                    'follow_4_plus': row['follow_4_plus'] or 0,
                    'total': row['total'] or 0,
                    # 计算占比
                    'follow_0_rate': round(row['follow_0'] * 100.0 / (row['total'] or 1), 1),
                    'follow_1_rate': round(row['follow_1'] * 100.0 / (row['total'] or 1), 1),
                    'follow_2_rate': round(row['follow_2'] * 100.0 / (row['total'] or 1), 1),
                    'follow_3_rate': round(row['follow_3'] * 100.0 / (row['total'] or 1), 1),
                    'follow_4_plus_rate': round(row['follow_4_plus'] * 100.0 / (row['total'] or 1), 1)
                }
                distribution_data.append(row_dict)
        
        return jsonify({
            'success': True,
            'data': {
                'dealers': dealer_list,
                'distribution': distribution_data,
                'time_range': {
                    'month_start': month_start.strftime("%Y-%m-%d"),
                    'end_time': end_datetime.strftime("%Y-%m-%d %H:%M:%S"),
                    'description': f"统计范围：{month_start.strftime('%Y年%m月')}累计至{end_datetime.strftime('%m月%d日18:00')}"
                }
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


if __name__ == '__main__':
    init_system(force_refresh=False)
    print("Starting Leads Analytics Server on http://0.0.0.0:5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
