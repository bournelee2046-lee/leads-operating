import sys
import os
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from datetime import datetime
from io import BytesIO

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backend.config import Config
from backend.core.db_manager import RawDBManager
from backend.core.duckdb_manager import DuckDBManager
from backend.core.query_metadata import metadata_registry
from backend.core.query_builder import (
    build_detail_query, build_aggregate_query,
    QueryBuilderError, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE, MAX_QUERY_ROWS
)

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


@app.route('/api/visit_stats/export', methods=['GET'])
def export_visit_stats():
    try:
        import openpyxl
        
        date_from = request.args.get('date_from', '')
        date_to = request.args.get('date_to', '')
        region = request.args.get('region', '')
        zone = request.args.get('zone', '')
        dealer_code = request.args.get('dealer_code', '')
        
        conn = duck_db.get_connection()
        sqlite_path = str(raw_db.db_path)
        
        date_filter = ""
        params = []
        
        if date_from:
            date_filter += " AND CAST(visit_time AS DATE) >= ?"
            params.append(date_from)
        
        if date_to:
            date_filter += " AND CAST(visit_time AS DATE) <= ?"
            params.append(date_to)
        
        dealer_filter = ""
        dealer_params = []
        
        if region:
            dealer_filter += " AND d.region = ?"
            dealer_params.append(region)
        
        if zone:
            dealer_filter += " AND d.zone = ?"
            dealer_params.append(zone)
        
        if dealer_code:
            dealer_filter += " AND dv.dealer_id = ?"
            dealer_params.append(dealer_code)
        
        sqlite_path = str(raw_db.db_path)
        
        sql = f"""
            WITH dealer_visits AS (
                SELECT 
                    f.dealer_id,
                    COUNT(*) as visit_count,
                    COUNT(DISTINCT m.lead_id || '_' || CAST(m.visit_time AS DATE)) as lead_count,
                    COUNT(CASE WHEN m.channel_1 = '线上' THEN 1 END) as online_count,
                    COUNT(CASE WHEN m.channel_1 = '线下' THEN 1 END) as offline_count,
                    COUNT(DISTINCT CASE WHEN m.channel_1 = '线上' THEN m.lead_id || '_' || CAST(m.visit_time AS DATE) END) as online_lead_count,
                    COUNT(DISTINCT CASE WHEN m.channel_1 = '线下' THEN m.lead_id || '_' || CAST(m.visit_time AS DATE) END) as offline_lead_count
                FROM (
                    SELECT DISTINCT dealer_id, CAST(visit_time AS DATE) as visit_date
                    FROM mart_customer_visit
                    WHERE 1=1 {date_filter}
                ) f
                JOIN mart_customer_visit m ON f.dealer_id = m.dealer_id AND CAST(m.visit_time AS DATE) = f.visit_date
                GROUP BY f.dealer_id
            )
            SELECT 
                d.region,
                d.zone,
                d.dealer_id,
                d.dealer_name,
                COALESCE(dv.visit_count, 0) as visit_count,
                COALESCE(dv.lead_count, 0) as lead_count,
                COALESCE(dv.online_count, 0) as online_count,
                COALESCE(dv.online_lead_count, 0) as online_lead_count,
                COALESCE(dv.offline_count, 0) as offline_count,
                COALESCE(dv.offline_lead_count, 0) as offline_lead_count
            FROM mart_dealers d
            LEFT JOIN dealer_visits dv ON d.dealer_id = dv.dealer_id
            WHERE 1=1 {dealer_filter}
            ORDER BY d.source_rowid
        """
        
        results = conn.execute(sql, params + dealer_params).fetchall()
        
        columns = ['大区', '战区', '门店编号', '门店名称', '进店次数', '进店客流', '线上进店数', '线上进店客流', '线下进店数', '线下进店客流']
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "客流统计"
        
        ws.append(columns)
        
        for row in results:
            row_data = [val if val is not None else '' for val in row]
            ws.append(row_data)
        
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        
        filename = f"客流统计_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/visit_stats', methods=['GET'])
def get_visit_stats():
    try:
        date_from = request.args.get('date_from', '')
        date_to = request.args.get('date_to', '')
        region = request.args.get('region', '')
        zone = request.args.get('zone', '')
        dealer_code = request.args.get('dealer_code', '')
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 100))
        
        conn = duck_db.get_connection()
        
        date_filter = ""
        params = []
        
        if date_from:
            date_filter += " AND CAST(visit_time AS DATE) >= ?"
            params.append(date_from)
        
        if date_to:
            date_filter += " AND CAST(visit_time AS DATE) <= ?"
            params.append(date_to)
        
        dealer_filter = ""
        dealer_params = []
        
        if region:
            dealer_filter += " AND d.region = ?"
            dealer_params.append(region)
        
        if zone:
            dealer_filter += " AND d.zone = ?"
            dealer_params.append(zone)
        
        if dealer_code:
            dealer_filter += " AND dv.dealer_id = ?"
            dealer_params.append(dealer_code)
        
        sqlite_path = str(raw_db.db_path)
        
        sql = f"""
            WITH dealer_visits AS (
                SELECT 
                    f.dealer_id,
                    COUNT(*) as visit_count,
                    COUNT(DISTINCT m.lead_id || '_' || CAST(m.visit_time AS DATE)) as lead_count,
                    COUNT(CASE WHEN m.channel_1 = '线上' THEN 1 END) as online_count,
                    COUNT(CASE WHEN m.channel_1 = '线下' THEN 1 END) as offline_count,
                    COUNT(DISTINCT CASE WHEN m.channel_1 = '线上' THEN m.lead_id || '_' || CAST(m.visit_time AS DATE) END) as online_lead_count,
                    COUNT(DISTINCT CASE WHEN m.channel_1 = '线下' THEN m.lead_id || '_' || CAST(m.visit_time AS DATE) END) as offline_lead_count
                FROM (
                    SELECT DISTINCT dealer_id, CAST(visit_time AS DATE) as visit_date
                    FROM mart_customer_visit
                    WHERE 1=1 {date_filter}
                ) f
                JOIN mart_customer_visit m ON f.dealer_id = m.dealer_id AND CAST(m.visit_time AS DATE) = f.visit_date
                GROUP BY f.dealer_id
            )
            SELECT 
                d.region,
                d.zone,
                d.dealer_id,
                d.dealer_name,
                COALESCE(dv.visit_count, 0) as visit_count,
                COALESCE(dv.lead_count, 0) as lead_count,
                COALESCE(dv.online_count, 0) as online_count,
                COALESCE(dv.online_lead_count, 0) as online_lead_count,
                COALESCE(dv.offline_count, 0) as offline_count,
                COALESCE(dv.offline_lead_count, 0) as offline_lead_count
            FROM mart_dealers d
            LEFT JOIN dealer_visits dv ON d.dealer_id = dv.dealer_id
            WHERE 1=1 {dealer_filter}
            ORDER BY d.source_rowid
        """
        
        results = conn.execute(sql, params + dealer_params).fetchall()
        
        total_grand = {
            'total_visits': sum(row[4] for row in results),
            'unique_lead_visits': sum(row[5] for row in results),
            'online_visits': sum(row[6] for row in results),
            'online_lead_visits': sum(row[7] for row in results),
            'offline_visits': sum(row[8] for row in results),
            'offline_lead_visits': sum(row[9] for row in results),
        }
        
        data = []
        for row in results:
            data.append({
                'region': row[0] or '',
                'zone': row[1] or '',
                'dealer_id': row[2],
                'dealer_name': row[3] or '',
                'total_visits': row[4] or 0,
                'unique_lead_visits': row[5] or 0,
                'online_visits': row[6] or 0,
                'online_lead_visits': row[7] or 0,
                'offline_visits': row[8] or 0,
                'offline_lead_visits': row[9] or 0
            })
        
        total = len(data)
        offset = (page - 1) * page_size
        paged_data = data[offset:offset + page_size]
        
        return jsonify({
            'success': True,
            'data': paged_data,
            'pagination': {
                'total': total,
                'page': page,
                'page_size': page_size,
                'total_pages': (total + page_size - 1) // page_size if page_size > 0 else 1
            },
            'grand_total': total_grand
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
    mode: 'full' (全量重算) | 'incremental' (增量同步新数据) | 'recompute' (仅重算指标) | 'refresh_personnel' (刷新人员信息)
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

        elif mode == 'refresh_personnel':
            print("Refreshing personnel info...")
            duck_db.refresh_personnel_info()
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
    
    支持自定义时间范围：start_date, end_date (格式: YYYY-MM-DD)
    默认：当月累计至前一天18:00前
    线索标准：一级渠道为线上且四级渠道不包含"反写"
    跟进次数标准：线索表里的"总跟进次数"字段，空值代表未跟进
    """
    try:
        from datetime import datetime, timedelta, date
        
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        
        today = date.today()
        
        if start_date_str:
            try:
                start_dt = datetime.strptime(start_date_str, '%Y-%m-%d')
                start_datetime = datetime(start_dt.year, start_dt.month, start_dt.day, 0, 0, 0)
            except ValueError:
                return jsonify({'success': False, 'message': 'start_date 格式错误，应为 YYYY-MM-DD'}), 400
        else:
            month_start = date(today.year, today.month, 1)
            start_datetime = datetime(month_start.year, month_start.month, month_start.day, 0, 0, 0)
        
        if end_date_str:
            try:
                end_dt = datetime.strptime(end_date_str, '%Y-%m-%d')
                yesterday = today - timedelta(days=1)
                if date(end_dt.year, end_dt.month, end_dt.day) >= yesterday:
                    end_datetime = datetime(end_dt.year, end_dt.month, end_dt.day, 18, 0, 0)
                else:
                    end_datetime = datetime(end_dt.year, end_dt.month, end_dt.day, 23, 59, 59)
            except ValueError:
                return jsonify({'success': False, 'message': 'end_date 格式错误，应为 YYYY-MM-DD'}), 400
        else:
            yesterday = today - timedelta(days=1)
            end_datetime = datetime(yesterday.year, yesterday.month, yesterday.day, 18, 0, 0)
        
        # 获取门店列表
        dealers = raw_db.get_dealers()
        dealer_list = [dict(d) for d in dealers]
        
        # 获取跟进次数分布数据
        with raw_db.get_connection() as conn:
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
                    AND l.跟进截止时间 IS NOT NULL AND l.跟进截止时间 != ''
                    AND l.最终下发时间 >= ?
                    AND l.最终下发时间 <= ?
                GROUP BY d.店编号, d.店简称, d.大区, d.战区
                ORDER BY d.rowid
            """
            
            results = conn.execute(query, [
                start_datetime.strftime("%Y-%m-%d %H:%M:%S"),
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
                    'start_date': start_datetime.strftime("%Y-%m-%d"),
                    'end_date': end_datetime.strftime("%Y-%m-%d"),
                    'description': f"统计范围：{start_datetime.strftime('%Y年%m月%d日')} 至 {end_datetime.strftime('%Y年%m月%d日%H:%M')}"
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


@app.route('/api/customer_visit/detail', methods=['GET'])
def get_customer_visit_detail():
    try:
        dealer_code = request.args.get('dealer_code', '')
        channel_1 = request.args.get('channel_1', '')
        date_from = request.args.get('date_from', '')
        date_to = request.args.get('date_to', '')
        phone = request.args.get('phone', '')
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 100))
        
        conn = duck_db.get_connection()
        
        where_clauses = ["m.dealer_id IS NOT NULL"]
        params = []
        
        if dealer_code:
            where_clauses.append("m.dealer_id = ?")
            params.append(dealer_code)
        
        if channel_1:
            if channel_1 == '__EMPTY__':
                where_clauses.append("(m.channel_1 IS NULL OR m.channel_1 = '')")
            else:
                where_clauses.append("m.channel_1 = ?")
                params.append(channel_1)
        
        if date_from:
            where_clauses.append("m.visit_time >= ?")
            params.append(date_from)
        
        if date_to:
            where_clauses.append("m.visit_time <= ?")
            params.append(date_to + ' 23:59:59')
        
        if phone:
            where_clauses.append("COALESCE(m.phone, '') = ?")
            params.append(phone)
        
        where_sql = " AND ".join(where_clauses)
        
        count_sql = f"""
            SELECT COUNT(*) as total
            FROM mart_customer_visit m
            WHERE {where_sql}
        """
        
        total_result = conn.execute(count_sql, params).fetchone()
        total = total_result[0] if total_result else 0
        
        offset = (page - 1) * page_size
        
        sql = f"""
            SELECT 
                COALESCE(m.region, '') as 大区,
                COALESCE(m.zone, '') as 战区,
                m.dealer_id,
                COALESCE(m.dealer_short_name, '') as 店简称,
                m.lead_id,
                COALESCE(m.channel_1, '') as channel_1,
                COALESCE(m.channel_2, '') as channel_2,
                COALESCE(m.channel_3, '') as channel_3,
                COALESCE(m.channel_4, '') as channel_4,
                m.visit_time,
                COALESCE(m.follower_name, '') as follower_name,
                COALESCE(m.follower_position, '') as follower_position,
                m.followup_created_time,
                COALESCE(m.phone, '') as phone
            FROM mart_customer_visit m
            WHERE {where_sql}
            ORDER BY m.visit_time DESC
            LIMIT {page_size} OFFSET {offset}
        """
        
        results = conn.execute(sql, params).fetchall()
        
        data = []
        for row in results:
            data.append({
                '大区': row[0] or '',
                '战区': row[1] or '',
                '店编号': row[2],
                '店简称': row[3] or '',
                '门店线索id': row[4],
                '一级渠道': row[5] or '',
                '二级渠道': row[6] or '',
                '三级渠道': row[7] or '',
                '四级渠道': row[8] or '',
                '客户进店时间': str(row[9]) if row[9] else '',
                '顾问姓名': row[10] or '',
                '顾问岗位': row[11] or '',
                '创建时间': str(row[12]) if row[12] else '',
                '手机号': row[13] or ''
            })
        
        return jsonify({
            'success': True,
            'data': data,
            'pagination': {
                'total': total,
                'page': page,
                'page_size': page_size,
                'total_pages': (total + page_size - 1) // page_size
            }
        })
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/customer_visit/stats', methods=['GET'])
def get_customer_visit_stats():
    try:
        conn = duck_db.get_connection()
        sql = """
            SELECT 
                COUNT(*) as total_visits,
                COUNT(DISTINCT m.lead_id) as unique_leads,
                COUNT(DISTINCT m.dealer_id) as dealer_count,
                COUNT(DISTINCT m.follower_name) as consultant_count
            FROM mart_customer_visit m
        """
        
        result = conn.execute(sql).fetchone()
        
        return jsonify({
            'success': True,
            'data': {
                'total_visits': result[0] if result else 0,
                'unique_leads': result[1] if result else 0,
                'dealer_count': result[2] if result else 0,
                'consultant_count': result[3] if result else 0
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/customer_visit/export', methods=['GET'])
def export_customer_visit():
    try:
        import openpyxl
        
        dealer_code = request.args.get('dealer_code', '')
        channel_1 = request.args.get('channel_1', '')
        date_from = request.args.get('date_from', '')
        date_to = request.args.get('date_to', '')
        phone = request.args.get('phone', '')
        
        conn = duck_db.get_connection()
        
        where_clauses = ["m.dealer_id IS NOT NULL"]
        params = []
        
        if dealer_code:
            where_clauses.append("m.dealer_id = ?")
            params.append(dealer_code)
        
        if channel_1:
            if channel_1 == '__EMPTY__':
                where_clauses.append("(m.channel_1 IS NULL OR m.channel_1 = '')")
            else:
                where_clauses.append("m.channel_1 = ?")
                params.append(channel_1)
        
        if date_from:
            where_clauses.append("m.visit_time >= ?")
            params.append(date_from)
        
        if date_to:
            where_clauses.append("m.visit_time <= ?")
            params.append(date_to + ' 23:59:59')
        
        if phone:
            where_clauses.append("COALESCE(m.phone, '') = ?")
            params.append(phone)
        
        where_sql = " AND ".join(where_clauses)
        
        sql = f"""
            SELECT 
                COALESCE(m.region, '') as 大区,
                COALESCE(m.zone, '') as 战区,
                m.dealer_id as 店编号,
                COALESCE(m.dealer_short_name, '') as 店简称,
                m.lead_id as 门店线索id,
                COALESCE(m.channel_1, '') as 一级渠道,
                COALESCE(m.channel_2, '') as 二级渠道,
                COALESCE(m.channel_3, '') as 三级渠道,
                COALESCE(m.channel_4, '') as 四级渠道,
                m.visit_time as 客户进店时间,
                COALESCE(m.follower_name, '') as 顾问姓名,
                COALESCE(m.follower_position, '') as 顾问岗位,
                COALESCE(m.phone, '') as 手机号,
                m.followup_created_time as 创建时间
            FROM mart_customer_visit m
            WHERE {where_sql}
            ORDER BY m.visit_time DESC
        """
        
        result_obj = conn.execute(sql, params)
        columns = [desc[0] for desc in result_obj.description]
        results = result_obj.fetchall()
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "客流明细"
        
        ws.append(columns)
        
        for row in results:
            row_data = []
            for val in row:
                if isinstance(val, datetime):
                    row_data.append(val.strftime('%Y-%m-%d %H:%M:%S'))
                else:
                    row_data.append(val if val is not None else '')
            ws.append(row_data)
        
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        
        filename = f"客流明细_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/tables', methods=['GET'])
def get_query_tables():
    """获取所有可查询的表列表"""
    try:
        category = request.args.get('category')
        tables = metadata_registry.get_all_tables(category=category)
        return jsonify({
            'success': True,
            'data': tables
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/table/<table_name>/schema', methods=['GET'])
def get_table_schema(table_name):
    """获取指定表的字段元数据"""
    try:
        schema = metadata_registry.get_table_schema(table_name)
        if not schema:
            return jsonify({
                'success': False,
                'message': f'Table {table_name} not found or not queryable'
            }), 404

        return jsonify({
            'success': True,
            'data': schema
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/detail', methods=['POST'])
def query_detail():
    """明细查询（精确查询单条/多条记录）"""
    try:
        data = request.get_json() or {}

        table_name = data.get('table')
        if not table_name:
            return jsonify({'success': False, 'message': 'table is required'}), 400

        if not metadata_registry.validate_table(table_name):
            return jsonify({'success': False, 'message': f'Invalid table: {table_name}'}), 400

        table_schema = metadata_registry.get_table_schema(table_name)
        columns_meta = {col['name']: col for col in table_schema['columns']}

        columns = data.get('columns', ['*'])
        if columns != ['*']:
            columns = metadata_registry.validate_columns(table_name, columns)
            if not columns:
                columns = list(columns_meta.keys())

        filters = data.get('filters', [])
        for f in filters:
            if 'field' not in f or 'operator' not in f:
                return jsonify({'success': False, 'message': 'Each filter must have field and operator'}), 400

        order_by = data.get('order_by', [])
        page = int(data.get('page', 1))
        page_size = int(data.get('page_size', DEFAULT_PAGE_SIZE))

        data_sql, count_sql, params = build_detail_query(
            table_name=table_name,
            columns=columns,
            filters=filters,
            order_by=order_by,
            page=page,
            page_size=page_size,
            columns_metadata=columns_meta
        )

        conn = duck_db.get_connection()

        count_result = conn.execute(count_sql, params).fetchone()
        total = count_result[0] if count_result else 0

        if page_size > MAX_QUERY_ROWS:
            return jsonify({'success': False, 'message': 'page_size too large, max is ' + str(MAX_QUERY_ROWS)}), 400

        result_obj = conn.execute(data_sql, params)
        column_names = [d[0] for d in result_obj.description]
        results = result_obj.fetchall()

        result_list = []
        for row in results:
            row_dict = dict(zip(column_names, row))
            for col_name, col_info in columns_meta.items():
                if col_info.get('sensitive') and col_name in row_dict and row_dict[col_name]:
                    row_dict[col_name] = mask_sensitive(row_dict[col_name], col_info['type'])
            result_list.append(row_dict)

        return jsonify({
            'success': True,
            'data': {
                'list': result_list,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total': total,
                    'total_pages': (total + page_size - 1) // page_size if page_size > 0 else 1
                }
            }
        })
    except QueryBuilderError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/aggregate', methods=['POST'])
def query_aggregate():
    """聚合查询（多维度统计）"""
    try:
        data = request.get_json() or {}

        table_name = data.get('table')
        if not table_name:
            return jsonify({'success': False, 'message': 'table is required'}), 400

        if not metadata_registry.validate_table(table_name):
            return jsonify({'success': False, 'message': f'Invalid table: {table_name}'}), 400

        table_schema = metadata_registry.get_table_schema(table_name)
        columns_meta = {col['name']: col for col in table_schema['columns']}

        group_by = data.get('group_by', [])
        if group_by:
            group_by = metadata_registry.validate_columns(table_name, group_by)

        aggregations = data.get('aggregations', [])
        if not aggregations and not group_by:
            aggregations = [{'field': '*', 'func': 'COUNT', 'alias': 'count'}]

        for agg in aggregations:
            if 'field' not in agg or 'func' not in agg:
                return jsonify({'success': False, 'message': 'Each aggregation must have field and func'}), 400

        filters = data.get('filters', [])
        for f in filters:
            if 'field' not in f or 'operator' not in f:
                return jsonify({'success': False, 'message': 'Each filter must have field and operator'}), 400

        order_by = data.get('order_by', [])
        page = int(data.get('page', 1))
        page_size = int(data.get('page_size', DEFAULT_PAGE_SIZE))

        data_sql, count_sql, params = build_aggregate_query(
            table_name=table_name,
            group_by=group_by,
            aggregations=aggregations,
            filters=filters,
            order_by=order_by,
            page=page,
            page_size=page_size,
            columns_metadata=columns_meta
        )

        conn = duck_db.get_connection()

        count_result = conn.execute(count_sql, params).fetchone()
        total = count_result[0] if count_result else 0

        result_obj = conn.execute(data_sql, params)
        column_names = [d[0] for d in result_obj.description]
        results = result_obj.fetchall()

        result_list = []
        for row in results:
            row_dict = dict(zip(column_names, row))
            result_list.append(row_dict)

        return jsonify({
            'success': True,
            'data': {
                'list': result_list,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total': total,
                    'total_pages': (total + page_size - 1) // page_size if page_size > 0 else 1
                },
                'meta': {
                    'group_by': group_by,
                    'aggregations': aggregations
                }
            }
        })
    except QueryBuilderError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/export', methods=['POST'])
def export_query_result():
    """导出查询结果为 Excel"""
    try:
        import openpyxl
        from io import BytesIO

        data = request.get_json() or {}
        query_type = data.get('query_type', 'detail')

        table_name = data.get('table')
        if not table_name:
            return jsonify({'success': False, 'message': 'table is required'}), 400

        if not metadata_registry.validate_table(table_name):
            return jsonify({'success': False, 'message': f'Invalid table: {table_name}'}), 400

        table_schema = metadata_registry.get_table_schema(table_name)
        columns_meta = {col['name']: col for col in table_schema['columns']}

        filters = data.get('filters', [])
        order_by = data.get('order_by', [])

        if query_type == 'detail':
            columns = data.get('columns', ['*'])
            if columns != ['*']:
                columns = metadata_registry.validate_columns(table_name, columns)
                if not columns:
                    columns = list(columns_meta.keys())

            data_sql, _, params = build_detail_query(
                table_name=table_name,
                columns=columns,
                filters=filters,
                order_by=order_by,
                page=1,
                page_size=MAX_QUERY_ROWS,
                columns_metadata=columns_meta
            )
        else:
            group_by = data.get('group_by', [])
            if group_by:
                group_by = metadata_registry.validate_columns(table_name, group_by)

            aggregations = data.get('aggregations', [])
            if not aggregations and not group_by:
                aggregations = [{'field': '*', 'func': 'COUNT', 'alias': 'count'}]

            data_sql, _, params = build_aggregate_query(
                table_name=table_name,
                group_by=group_by,
                aggregations=aggregations,
                filters=filters,
                order_by=order_by,
                page=1,
                page_size=MAX_QUERY_ROWS,
                columns_metadata=columns_meta
            )

        conn = duck_db.get_connection()
        result_obj = conn.execute(data_sql, params)
        column_names = [d[0] for d in result_obj.description]
        results = result_obj.fetchall()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = table_schema['display_name']

        header_row = [columns_meta.get(col, {}).get('display_name', col) for col in column_names]
        ws.append(header_row)

        for row in results:
            row_data = []
            for i, val in enumerate(row):
                col_name = column_names[i]
                col_info = columns_meta.get(col_name, {})
                if col_info.get('sensitive') and val:
                    val = mask_sensitive(val, col_info.get('type', ''))
                if isinstance(val, datetime):
                    row_data.append(val.strftime('%Y-%m-%d %H:%M:%S'))
                else:
                    row_data.append(val if val is not None else '')
            ws.append(row_data)

        for col_idx, col_name in enumerate(column_names, 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.font = openpyxl.styles.Font(bold=True)
            cell.fill = openpyxl.styles.PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

        output = BytesIO()
        wb.save(output)
        output.seek(0)

        filename = f"{table_schema['display_name']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
    except QueryBuilderError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/filterable/<table_name>', methods=['GET'])
def get_filterable_columns(table_name):
    """获取可过滤的字段列表"""
    try:
        if not metadata_registry.validate_table(table_name):
            return jsonify({'success': False, 'message': f'Invalid table: {table_name}'}), 404

        columns = metadata_registry.get_filterable_columns(table_name)
        return jsonify({
            'success': True,
            'data': columns
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/groupable/<table_name>', methods=['GET'])
def get_groupable_columns(table_name):
    """获取可分组的字段列表"""
    try:
        if not metadata_registry.validate_table(table_name):
            return jsonify({'success': False, 'message': f'Invalid table: {table_name}'}), 404

        columns = metadata_registry.get_groupable_columns(table_name)
        return jsonify({
            'success': True,
            'data': columns
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/query/aggregatable/<table_name>', methods=['GET'])
def get_aggregatable_columns(table_name):
    """获取可聚合的字段列表"""
    try:
        if not metadata_registry.validate_table(table_name):
            return jsonify({'success': False, 'message': f'Invalid table: {table_name}'}), 404

        columns = metadata_registry.get_aggregatable_columns(table_name)
        return jsonify({
            'success': True,
            'data': columns
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


def mask_sensitive(value, field_type):
    """脱敏处理"""
    if not value:
        return value
    value_str = str(value)
    if len(value_str) <= 4:
        return '***'
    if 'PHONE' in field_type.upper() or 'VARCHAR' in field_type.upper():
        if len(value_str) == 11:
            return value_str[:3] + '****' + value_str[7:]
        return value_str[:2] + '***' + value_str[-2:]
    return '***'


@app.route('/api/dealer-daily-report', methods=['GET'])
def get_dealer_daily_report():
    try:
        period = request.args.get('period', 'daily')
        region = request.args.get('region', '')
        zone = request.args.get('zone', '')
        sort_by = request.args.get('sort_by', 'lead_count')
        sort_order = request.args.get('sort_order', 'desc')
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 50))
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        conn = duck_db.get_connection()

        has_custom_range = start_date and end_date

        if has_custom_range:
            return _get_dealer_report_custom_range(
                conn, start_date, end_date, region, zone,
                sort_by, sort_order, page, page_size
            )
        else:
            return _get_dealer_report_precomputed(
                conn, period, region, zone,
                sort_by, sort_order, page, page_size
            )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


def _get_dealer_report_precomputed(conn, period, region, zone, sort_by, sort_order, page, page_size):
    """使用预计算表查询（单日或当月累计）"""
    where_clauses = ["period_type = ?"]
    params = [period]

    if region:
        where_clauses.append("region = ?")
        params.append(region)

    if zone:
        where_clauses.append("zone = ?")
        params.append(zone)

    where_sql = " AND ".join(where_clauses)

    prefix = 'm_' if period == 'monthly' else 'd_'
    valid_sort_columns = [
        f'{prefix}n60_lead_count', f'{prefix}n60_follow_30min_count',
        f'{prefix}lead_count', f'{prefix}follow_30min_count', f'{prefix}follow_30min_rate',
        f'{prefix}3day_3follow_task_count', f'{prefix}3day_3follow_count', f'{prefix}3day_3follow_rate',
        f'{prefix}valid_lead_count', f'{prefix}valid_lead_rate',
        f'{prefix}valid_local_lead_count', f'{prefix}local_lead_count',
        f'{prefix}to_shop_count', f'{prefix}lead_to_shop_rate',
        f'{prefix}local_lead_to_shop_rate', f'{prefix}valid_lead_to_shop_rate',
        f'{prefix}valid_local_lead_to_shop_rate',
        'dealer_name', 'region', 'zone'
    ]
    if sort_by not in valid_sort_columns:
        sort_by = f'{prefix}lead_count'
    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'

    count_sql = f"SELECT COUNT(*) FROM report_dealer_daily WHERE {where_sql}"
    total = conn.execute(count_sql, params).fetchone()[0]

    offset = (page - 1) * page_size

    data_sql = f"""
        SELECT
            report_date, period_type, dealer_id, dealer_name,
            region, zone, province, region_manager, zone_manager, inspector,
            {prefix}n60_lead_count AS n60_lead_count,
            {prefix}n60_follow_30min_count AS n60_follow_30min_count,
            {prefix}lead_count AS lead_count,
            {prefix}follow_30min_count AS follow_30min_count,
            {prefix}follow_30min_rate AS follow_30min_rate,
            {prefix}3day_3follow_task_count AS day3_3follow_task_count,
            {prefix}3day_3follow_count AS day3_3follow_count,
            {prefix}3day_3follow_rate AS day3_3follow_rate,
            {prefix}valid_lead_count AS valid_lead_count,
            {prefix}valid_lead_rate AS valid_lead_rate,
            {prefix}valid_local_lead_count AS valid_local_lead_count,
            {prefix}local_lead_count AS local_lead_count,
            {prefix}to_shop_count AS to_shop_count,
            {prefix}lead_to_shop_rate AS lead_to_shop_rate,
            {prefix}local_lead_to_shop_rate AS local_lead_to_shop_rate,
            {prefix}valid_lead_to_shop_rate AS valid_lead_to_shop_rate,
            {prefix}valid_local_lead_to_shop_rate AS valid_local_lead_to_shop_rate
        FROM report_dealer_daily
        WHERE {where_sql}
        ORDER BY {sort_by} {sort_direction}, dealer_id ASC
        LIMIT ? OFFSET ?
    """
    results = conn.execute(data_sql, params + [page_size, offset]).fetchall()

    summary_sql = f"""
        SELECT
            SUM({prefix}n60_lead_count), SUM({prefix}n60_follow_30min_count),
            SUM({prefix}lead_count), SUM({prefix}follow_30min_count),
            CASE WHEN SUM({prefix}lead_count) > 0
                THEN SUM({prefix}follow_30min_count) * 100.0 / SUM({prefix}lead_count) ELSE 0 END,
            SUM({prefix}3day_3follow_task_count), SUM({prefix}3day_3follow_count),
            CASE WHEN SUM({prefix}3day_3follow_task_count) > 0
                THEN SUM({prefix}3day_3follow_count) * 100.0 / SUM({prefix}3day_3follow_task_count) ELSE 0 END,
            SUM({prefix}valid_lead_count),
            CASE WHEN SUM({prefix}lead_count) > 0
                THEN SUM({prefix}valid_lead_count) * 100.0 / SUM({prefix}lead_count) ELSE 0 END,
            SUM({prefix}valid_local_lead_count), SUM({prefix}local_lead_count),
            SUM({prefix}to_shop_count),
            CASE WHEN SUM({prefix}lead_count) > 0
                THEN SUM({prefix}to_shop_count) * 100.0 / SUM({prefix}lead_count) ELSE 0 END,
            CASE WHEN SUM({prefix}local_lead_count) > 0
                THEN SUM({prefix}to_shop_count) * 100.0 / SUM({prefix}local_lead_count) ELSE 0 END,
            CASE WHEN SUM({prefix}valid_lead_count) > 0
                THEN SUM({prefix}to_shop_count) * 100.0 / SUM({prefix}valid_lead_count) ELSE 0 END,
            CASE WHEN SUM({prefix}valid_local_lead_count) > 0
                THEN SUM({prefix}to_shop_count) * 100.0 / SUM({prefix}valid_local_lead_count) ELSE 0 END
        FROM report_dealer_daily
        WHERE {where_sql}
    """
    summary_result = conn.execute(summary_sql, params).fetchone()

    columns = [
        'report_date', 'period_type', 'dealer_id', 'dealer_name',
        'region', 'zone', 'province', 'region_manager', 'zone_manager', 'inspector',
        'n60_lead_count', 'n60_follow_30min_count',
        'lead_count', 'follow_30min_count', 'follow_30min_rate',
        'day3_3follow_task_count', 'day3_3follow_count', 'day3_3follow_rate',
        'valid_lead_count', 'valid_lead_rate',
        'valid_local_lead_count', 'local_lead_count',
        'to_shop_count', 'lead_to_shop_rate',
        'local_lead_to_shop_rate', 'valid_lead_to_shop_rate',
        'valid_local_lead_to_shop_rate'
    ]

    data = []
    for row in results:
        data.append(dict(zip(columns, row)))

    summary = None
    if summary_result:
        summary_keys = [
            'n60_lead_count', 'n60_follow_30min_count',
            'lead_count', 'follow_30min_count', 'follow_30min_rate',
            'day3_3follow_task_count', 'day3_3follow_count', 'day3_3follow_rate',
            'valid_lead_count', 'valid_lead_rate',
            'valid_local_lead_count', 'local_lead_count',
            'to_shop_count', 'lead_to_shop_rate',
            'local_lead_to_shop_rate', 'valid_lead_to_shop_rate',
            'valid_local_lead_to_shop_rate'
        ]
        summary = dict(zip(summary_keys, summary_result))

    regions_result = conn.execute("SELECT DISTINCT region FROM mart_dealers WHERE region IS NOT NULL AND region != '' ORDER BY region").fetchall()
    zones_result = conn.execute("SELECT DISTINCT zone FROM mart_dealers WHERE zone IS NOT NULL AND zone != '' ORDER BY zone").fetchall()

    return jsonify({
        'success': True,
        'data': data,
        'summary': summary,
        'pagination': {
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size if page_size > 0 else 1
        },
        'filters': {
            'regions': [r[0] for r in regions_result],
            'zones': [z[0] for z in zones_result]
        }
    })


def _get_dealer_report_custom_range(conn, start_date, end_date, region, zone, sort_by, sort_order, page, page_size):
    """自定义日期范围实时计算"""
    # 日期直接嵌入SQL，DuckDB的DATE ?占位符语法有问题
    date_where = f"l.assign_date >= DATE '{start_date}' AND l.assign_date <= DATE '{end_date}'"
    visit_date_where = f"visit_date >= DATE '{start_date}' AND visit_date <= DATE '{end_date}'"

    dealer_where = []
    params = []
    if region:
        dealer_where.append("d.region = ?")
        params.append(region)
    if zone:
        dealer_where.append("d.zone = ?")
        params.append(zone)

    dealer_filter = " AND ".join(dealer_where)
    if dealer_filter:
        dealer_filter = " AND " + dealer_filter

    valid_sort_columns = [
        'n60_lead_count', 'n60_follow_30min_count',
        'lead_count', 'follow_30min_count', 'follow_30min_rate',
        'day3_3follow_task_count', 'day3_3follow_count', 'day3_3follow_rate',
        'valid_lead_count', 'valid_lead_rate',
        'valid_local_lead_count', 'local_lead_count',
        'to_shop_count', 'lead_to_shop_rate',
        'local_lead_to_shop_rate', 'valid_lead_to_shop_rate',
        'valid_local_lead_to_shop_rate',
        'dealer_name', 'region', 'zone'
    ]
    if sort_by not in valid_sort_columns:
        sort_by = 'lead_count'
    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'

    cutoff_time = f"{end_date} 18:00:00"
    from datetime import datetime as dt, timedelta as td
    cutoff_dt = dt.strptime(cutoff_time, "%Y-%m-%d %H:%M:%S")
    cutoff_time_72h = (cutoff_dt - td(hours=72)).strftime("%Y-%m-%d %H:%M:%S")

    count_sql = f"""
        SELECT COUNT(DISTINCT l.dealer_id)
        FROM mart_leads l
        LEFT JOIN mart_dealers d ON l.dealer_id = d.dealer_id
        WHERE l.channel_1 = '线上'
          AND l.dealer_id IN (SELECT dealer_id FROM mart_dealers)
          AND {date_where}
        {dealer_filter}
    """
    total = conn.execute(count_sql, params).fetchone()[0]

    offset = (page - 1) * page_size

    data_sql = f"""
        WITH base AS (
            SELECT
                l.*,
                d.dealer_name, d.region, d.zone, d.province,
                d.region_manager, d.zone_manager,
                COALESCE(NULLIF(TRIM(CAST(d.region_manager AS VARCHAR)), ''), '') AS inspector
            FROM mart_leads l
            LEFT JOIN mart_dealers d ON l.dealer_id = d.dealer_id
            WHERE l.channel_1 = '线上'
              AND l.dealer_id IN (SELECT dealer_id FROM mart_dealers)
              AND {date_where}
            {dealer_filter}
        ),
        shop_visit AS (
            SELECT dealer_id, SUM(unique_lead_count) AS visit_count
            FROM fact_daily_visit
            WHERE period_type = 'daily'
              AND {visit_date_where}
            GROUP BY dealer_id
        )
        SELECT
            DATE '{end_date}' AS report_date,
            'custom' AS period_type,
            b.dealer_id,
            MAX(b.dealer_name) AS dealer_name,
            MAX(b.region) AS region,
            MAX(b.zone) AS zone,
            MAX(b.province) AS province,
            MAX(b.region_manager) AS region_manager,
            MAX(b.zone_manager) AS zone_manager,
            MAX(b.inspector) AS inspector,

            SUM(CASE WHEN UPPER(COALESCE(b.invite_intent, '')) LIKE '%N60%' THEN 1 ELSE 0 END) AS n60_lead_count,
            SUM(CASE WHEN UPPER(COALESCE(b.invite_intent, '')) LIKE '%N60%' AND b.is_followed_in_30min THEN 1 ELSE 0 END) AS n60_follow_30min_count,

            COUNT(*) AS lead_count,
            SUM(CASE WHEN b.is_followed_in_30min THEN 1 ELSE 0 END) AS follow_30min_count,
            CASE WHEN COUNT(*) > 0
                THEN SUM(CASE WHEN b.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
                ELSE 0 END AS follow_30min_rate,

            COUNT(*) FILTER (
                WHERE b.follow_cutoff_time IS NOT NULL
                  AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                  AND NOT (
                      b.follow_count = 1
                      AND b.lead_status = '跟进中'
                      AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                  )
            ) AS day3_3follow_task_count,

            SUM(CASE WHEN
                b.follow_count IS NOT NULL
                AND b.follow_cutoff_time IS NOT NULL
                AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                AND NOT (
                    b.follow_count = 1
                    AND b.lead_status = '跟进中'
                    AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                )
                AND (
                    (b.follow_count = 1 AND b.lead_status != '跟进中' AND b.is_followed_in_30min)
                    OR
                    (b.follow_count >= 2 AND b.is_followed_in_30min
                     AND b.follow2_time IS NOT NULL AND b.first_follow_time IS NOT NULL
                     AND epoch(b.follow2_time) - epoch(b.first_follow_time) < 259200)
                )
                THEN 1 ELSE 0 END
            ) AS day3_3follow_count,

            CASE WHEN COUNT(*) FILTER (
                WHERE b.follow_cutoff_time IS NOT NULL
                 AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                 AND NOT (
                     b.follow_count = 1
                     AND b.lead_status = '跟进中'
                     AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                 )
            ) > 0
                THEN SUM(CASE WHEN
                    b.follow_count IS NOT NULL
                    AND b.follow_cutoff_time IS NOT NULL
                    AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                    AND NOT (
                        b.follow_count = 1
                        AND b.lead_status = '跟进中'
                        AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                    )
                    AND (
                        (b.follow_count = 1 AND b.lead_status != '跟进中' AND b.is_followed_in_30min)
                        OR
                        (b.follow_count >= 2 AND b.is_followed_in_30min
                         AND b.follow2_time IS NOT NULL AND b.first_follow_time IS NOT NULL
                         AND epoch(b.follow2_time) - epoch(b.first_follow_time) < 259200)
                    )
                    THEN 1 ELSE 0 END
                ) * 100.0 / COUNT(*) FILTER (
                    WHERE b.follow_cutoff_time IS NOT NULL
                     AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                     AND NOT (
                         b.follow_count = 1
                         AND b.lead_status = '跟进中'
                         AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                     )
                )
                ELSE 0 END AS day3_3follow_rate,

            SUM(CASE WHEN b.channel_3 != 'APP-试驾'
                      AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) AS valid_lead_count,
            CASE WHEN COUNT(*) > 0
                THEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) * 100.0 /
                     COUNT(*)
                ELSE 0 END AS valid_lead_rate,

            SUM(CASE WHEN b.channel_3 != 'APP-试驾'
                      AND b.lead_status NOT IN ('异地', '无效')
                      AND b.lead_status != '异地' THEN 1 ELSE 0 END) AS valid_local_lead_count,
            SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) AS local_lead_count,

            COALESCE(sv.visit_count, 0) AS to_shop_count,
            CASE WHEN COUNT(*) > 0 THEN COALESCE(sv.visit_count, 0) * 100.0 / COUNT(*) ELSE 0 END AS lead_to_shop_rate,
            CASE WHEN SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                THEN COALESCE(sv.visit_count, 0) * 100.0 / SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END)
                ELSE 0 END AS local_lead_to_shop_rate,
            CASE WHEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) > 0
                THEN COALESCE(sv.visit_count, 0) * 100.0 / SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END)
                ELSE 0 END AS valid_lead_to_shop_rate,
            CASE WHEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                THEN COALESCE(sv.visit_count, 0) * 100.0 / SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END)
                ELSE 0 END AS valid_local_lead_to_shop_rate

        FROM base b
        LEFT JOIN shop_visit sv ON b.dealer_id = sv.dealer_id
        GROUP BY b.dealer_id, sv.visit_count
        ORDER BY {sort_by} {sort_direction}, b.dealer_id ASC
        LIMIT ? OFFSET ?
    """
    results = conn.execute(data_sql, params + [page_size, offset]).fetchall()

    summary_sql = f"""
        WITH base AS (
            SELECT
                l.*,
                d.dealer_name, d.region, d.zone, d.province,
                d.region_manager, d.zone_manager,
                COALESCE(NULLIF(TRIM(CAST(d.region_manager AS VARCHAR)), ''), '') AS inspector
            FROM mart_leads l
            LEFT JOIN mart_dealers d ON l.dealer_id = d.dealer_id
            WHERE l.channel_1 = '线上'
              AND l.dealer_id IN (SELECT dealer_id FROM mart_dealers)
              AND {date_where}
            {dealer_filter}
        ),
        shop_visit AS (
            SELECT dealer_id, SUM(unique_lead_count) AS visit_count
            FROM fact_daily_visit
            WHERE period_type = 'daily'
              AND {visit_date_where}
            GROUP BY dealer_id
        )
        SELECT
            SUM(CASE WHEN UPPER(COALESCE(b.invite_intent, '')) LIKE '%N60%' THEN 1 ELSE 0 END),
            SUM(CASE WHEN UPPER(COALESCE(b.invite_intent, '')) LIKE '%N60%' AND b.is_followed_in_30min THEN 1 ELSE 0 END),
            COUNT(*),
            SUM(CASE WHEN b.is_followed_in_30min THEN 1 ELSE 0 END),
            CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN b.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / COUNT(*) ELSE 0 END,
            COUNT(*) FILTER (
                WHERE b.follow_cutoff_time IS NOT NULL
                  AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                  AND NOT (
                      b.follow_count = 1
                      AND b.lead_status = '跟进中'
                      AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                  )
            ),
            SUM(CASE WHEN
                b.follow_count IS NOT NULL AND b.follow_cutoff_time IS NOT NULL
                AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                AND NOT (
                    b.follow_count = 1
                    AND b.lead_status = '跟进中'
                    AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                )
                AND ((b.follow_count = 1 AND b.lead_status != '跟进中' AND b.is_followed_in_30min)
                     OR (b.follow_count >= 2 AND b.is_followed_in_30min
                         AND b.follow2_time IS NOT NULL AND b.first_follow_time IS NOT NULL
                         AND epoch(b.follow2_time) - epoch(b.first_follow_time) < 259200))
                THEN 1 ELSE 0 END),
            CASE WHEN COUNT(*) FILTER (WHERE b.follow_cutoff_time IS NOT NULL
                  AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                  AND NOT (
                      b.follow_count = 1
                      AND b.lead_status = '跟进中'
                      AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                  )) > 0
                THEN SUM(CASE WHEN
                    b.follow_count IS NOT NULL AND b.follow_cutoff_time IS NOT NULL
                    AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                    AND NOT (
                        b.follow_count = 1
                        AND b.lead_status = '跟进中'
                        AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                    )
                    AND ((b.follow_count = 1 AND b.lead_status != '跟进中' AND b.is_followed_in_30min)
                         OR (b.follow_count >= 2 AND b.is_followed_in_30min
                             AND b.follow2_time IS NOT NULL AND b.first_follow_time IS NOT NULL
                             AND epoch(b.follow2_time) - epoch(b.first_follow_time) < 259200))
                    THEN 1 ELSE 0 END) * 100.0 / COUNT(*) FILTER (
                        WHERE b.follow_cutoff_time IS NOT NULL
                          AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                          AND NOT (
                              b.follow_count = 1
                              AND b.lead_status = '跟进中'
                              AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                          ))
                ELSE 0 END,
            SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END),
            CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) * 100.0 / COUNT(*) ELSE 0 END,
            SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END),
            SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END),
            COALESCE(SUM(sv.visit_count), 0),
            CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(sv.visit_count), 0) * 100.0 / COUNT(*) ELSE 0 END,
            CASE WHEN SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                THEN COALESCE(SUM(sv.visit_count), 0) * 100.0 / SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) ELSE 0 END,
            CASE WHEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) > 0
                THEN COALESCE(SUM(sv.visit_count), 0) * 100.0 / SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) ELSE 0 END,
            CASE WHEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                THEN COALESCE(SUM(sv.visit_count), 0) * 100.0 / SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END) ELSE 0 END
        FROM base b
        LEFT JOIN shop_visit sv ON b.dealer_id = sv.dealer_id
    """
    summary_result = conn.execute(summary_sql, params).fetchone()

    columns = [
        'report_date', 'period_type', 'dealer_id', 'dealer_name',
        'region', 'zone', 'province', 'region_manager', 'zone_manager', 'inspector',
        'n60_lead_count', 'n60_follow_30min_count',
        'lead_count', 'follow_30min_count', 'follow_30min_rate',
        'day3_3follow_task_count', 'day3_3follow_count', 'day3_3follow_rate',
        'valid_lead_count', 'valid_lead_rate',
        'valid_local_lead_count', 'local_lead_count',
        'to_shop_count', 'lead_to_shop_rate',
        'local_lead_to_shop_rate', 'valid_lead_to_shop_rate',
        'valid_local_lead_to_shop_rate'
    ]

    data = []
    for row in results:
        data.append(dict(zip(columns, row)))

    summary = None
    if summary_result:
        summary_keys = [
            'n60_lead_count', 'n60_follow_30min_count',
            'lead_count', 'follow_30min_count', 'follow_30min_rate',
            'day3_3follow_task_count', 'day3_3follow_count', 'day3_3follow_rate',
            'valid_lead_count', 'valid_lead_rate',
            'valid_local_lead_count', 'local_lead_count',
            'to_shop_count', 'lead_to_shop_rate',
            'local_lead_to_shop_rate', 'valid_lead_to_shop_rate',
            'valid_local_lead_to_shop_rate'
        ]
        summary = dict(zip(summary_keys, summary_result))

    regions_result = conn.execute("SELECT DISTINCT region FROM mart_dealers WHERE region IS NOT NULL AND region != '' ORDER BY region").fetchall()
    zones_result = conn.execute("SELECT DISTINCT zone FROM mart_dealers WHERE zone IS NOT NULL AND zone != '' ORDER BY zone").fetchall()

    return jsonify({
        'success': True,
        'data': data,
        'summary': summary,
        'pagination': {
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size if page_size > 0 else 1
        },
        'filters': {
            'regions': [r[0] for r in regions_result],
            'zones': [z[0] for z in zones_result]
        }
    })


@app.route('/api/dealer-daily-report/export', methods=['GET'])
def export_dealer_daily_report():
    try:
        import openpyxl

        period = request.args.get('period', 'daily')
        region = request.args.get('region', '')
        zone = request.args.get('zone', '')
        sort_by = request.args.get('sort_by', 'lead_count')
        sort_order = request.args.get('sort_order', 'desc')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        conn = duck_db.get_connection()
        has_custom_range = start_date and end_date

        if has_custom_range:
            return _export_dealer_report_custom_range(
                conn, start_date, end_date, region, zone, sort_by, sort_order
            )
        else:
            return _export_dealer_report_precomputed(
                conn, period, region, zone, sort_by, sort_order
            )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


def _export_dealer_report_precomputed(conn, period, region, zone, sort_by, sort_order):
    """导出预计算表数据"""
    where_clauses = ["period_type = ?"]
    params = [period]

    if region:
        where_clauses.append("region = ?")
        params.append(region)
    if zone:
        where_clauses.append("zone = ?")
        params.append(zone)

    where_sql = " AND ".join(where_clauses)

    prefix = 'm_' if period == 'monthly' else 'd_'
    valid_sort_columns = [
        f'{prefix}n60_lead_count', f'{prefix}n60_follow_30min_count',
        f'{prefix}lead_count', f'{prefix}follow_30min_count', f'{prefix}follow_30min_rate',
        f'{prefix}3day_3follow_task_count', f'{prefix}3day_3follow_count', f'{prefix}3day_3follow_rate',
        f'{prefix}valid_lead_count', f'{prefix}valid_lead_rate',
        f'{prefix}valid_local_lead_count', f'{prefix}local_lead_count',
        f'{prefix}to_shop_count', f'{prefix}lead_to_shop_rate',
        f'{prefix}local_lead_to_shop_rate', f'{prefix}valid_lead_to_shop_rate',
        f'{prefix}valid_local_lead_to_shop_rate'
    ]
    if sort_by not in valid_sort_columns:
        sort_by = f'{prefix}lead_count'
    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'

    p_label = '本月' if period == 'monthly' else '本日'

    data_sql = f"""
        SELECT
            region, zone, dealer_id, dealer_name, province,
            {prefix}n60_lead_count, {prefix}n60_follow_30min_count,
            {prefix}lead_count, {prefix}follow_30min_count, {prefix}follow_30min_rate,
            {prefix}3day_3follow_task_count, {prefix}3day_3follow_count, {prefix}3day_3follow_rate,
            {prefix}valid_lead_count, {prefix}valid_lead_rate,
            {prefix}valid_local_lead_count, {prefix}local_lead_count,
            {prefix}to_shop_count, {prefix}lead_to_shop_rate,
            {prefix}local_lead_to_shop_rate, {prefix}valid_lead_to_shop_rate,
            {prefix}valid_local_lead_to_shop_rate
        FROM report_dealer_daily
        WHERE {where_sql}
        ORDER BY {sort_by} {sort_direction}, dealer_id ASC
    """
    results = conn.execute(data_sql, params).fetchall()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "门店运营日报"

    headers = ['大区', '战区', '门店编号', '门店名称', '省份',
                f'{p_label}_N60线索数', f'{p_label}_N60及时跟进数',
                f'{p_label}_线索量', f'{p_label}_30分钟跟进数', f'{p_label}_30分钟跟进率(%)',
                f'{p_label}_三天三次跟进任务数', f'{p_label}_三天三次跟进数', f'{p_label}_三天三次跟进率(%)',
                f'{p_label}_有效线索量', f'{p_label}_线索有效率(%)',
                f'{p_label}_有效线索量_本地', f'{p_label}_线索量_本地',
                f'{p_label}_到店数', f'{p_label}_线索到店率(%)',
                f'{p_label}_线索到店率_本地(%)', f'{p_label}_有效线索到店率(%)',
                f'{p_label}_有效线索到店率_本地(%)']

    ws.append(headers)

    for row in results:
        row_data = [val if val is not None else '' for val in row]
        ws.append(row_data)

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = openpyxl.styles.Font(bold=True)
        cell.fill = openpyxl.styles.PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"门店运营日报_{p_label}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )


def _export_dealer_report_custom_range(conn, start_date, end_date, region, zone, sort_by, sort_order):
    """导出自定义日期范围数据"""
    date_where = f"l.assign_date >= DATE '{start_date}' AND l.assign_date <= DATE '{end_date}'"
    visit_date_where = f"visit_date >= DATE '{start_date}' AND visit_date <= DATE '{end_date}'"

    dealer_where = []
    params = []
    if region:
        dealer_where.append("d.region = ?")
        params.append(region)
    if zone:
        dealer_where.append("d.zone = ?")
        params.append(zone)

    dealer_filter = " AND ".join(dealer_where)
    if dealer_filter:
        dealer_filter = " AND " + dealer_filter

    valid_sort_columns = [
        'n60_lead_count', 'n60_follow_30min_count',
        'lead_count', 'follow_30min_count', 'follow_30min_rate',
        'day3_3follow_task_count', 'day3_3follow_count', 'day3_3follow_rate',
        'valid_lead_count', 'valid_lead_rate',
        'valid_local_lead_count', 'local_lead_count',
        'to_shop_count', 'lead_to_shop_rate',
        'local_lead_to_shop_rate', 'valid_lead_to_shop_rate',
        'valid_local_lead_to_shop_rate',
        'dealer_name', 'region', 'zone'
    ]
    if sort_by not in valid_sort_columns:
        sort_by = 'lead_count'
    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'

    cutoff_time = f"{end_date} 18:00:00"

    data_sql = f"""
        WITH base AS (
            SELECT
                l.*,
                d.dealer_name, d.region, d.zone, d.province,
                d.region_manager, d.zone_manager,
                COALESCE(NULLIF(TRIM(CAST(d.region_manager AS VARCHAR)), ''), '') AS inspector
            FROM mart_leads l
            LEFT JOIN mart_dealers d ON l.dealer_id = d.dealer_id
            WHERE l.channel_1 = '线上'
              AND l.dealer_id IN (SELECT dealer_id FROM mart_dealers)
              AND {date_where}
            {dealer_filter}
        ),
        shop_visit AS (
            SELECT dealer_id, SUM(unique_lead_count) AS visit_count
            FROM fact_daily_visit
            WHERE period_type = 'daily'
              AND {visit_date_where}
            GROUP BY dealer_id
        )
        SELECT
            MAX(b.region) AS region,
            MAX(b.zone) AS zone,
            b.dealer_id,
            MAX(b.dealer_name) AS dealer_name,
            MAX(b.province) AS province,
            SUM(CASE WHEN UPPER(COALESCE(b.invite_intent, '')) LIKE '%N60%' THEN 1 ELSE 0 END) AS n60_lead_count,
            SUM(CASE WHEN UPPER(COALESCE(b.invite_intent, '')) LIKE '%N60%' AND b.is_followed_in_30min THEN 1 ELSE 0 END) AS n60_follow_30min_count,
            COUNT(*) AS lead_count,
            SUM(CASE WHEN b.is_followed_in_30min THEN 1 ELSE 0 END) AS follow_30min_count,
            CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN b.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / COUNT(*) ELSE 0 END AS follow_30min_rate,
            COUNT(*) FILTER (
                WHERE b.follow_cutoff_time IS NOT NULL
                  AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                  AND NOT (
                      b.follow_count = 1
                      AND b.lead_status = '跟进中'
                      AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                  )
            ) AS day3_3follow_task_count,
            SUM(CASE WHEN
                b.follow_count IS NOT NULL AND b.follow_cutoff_time IS NOT NULL
                AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                AND NOT (
                    b.follow_count = 1
                    AND b.lead_status = '跟进中'
                    AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                )
                AND ((b.follow_count = 1 AND b.lead_status != '跟进中' AND b.is_followed_in_30min)
                     OR (b.follow_count >= 2 AND b.is_followed_in_30min
                         AND b.follow2_time IS NOT NULL AND b.first_follow_time IS NOT NULL
                         AND epoch(b.follow2_time) - epoch(b.first_follow_time) < 259200))
                THEN 1 ELSE 0 END) AS day3_3follow_count,
            CASE WHEN COUNT(*) FILTER (
                WHERE b.follow_cutoff_time IS NOT NULL
                  AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                  AND NOT (
                      b.follow_count = 1
                      AND b.lead_status = '跟进中'
                      AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                  )
            ) > 0
                THEN SUM(CASE WHEN
                    b.follow_count IS NOT NULL AND b.follow_cutoff_time IS NOT NULL
                    AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                    AND NOT (
                        b.follow_count = 1
                        AND b.lead_status = '跟进中'
                        AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                    )
                    AND ((b.follow_count = 1 AND b.lead_status != '跟进中' AND b.is_followed_in_30min)
                         OR (b.follow_count >= 2 AND b.is_followed_in_30min
                             AND b.follow2_time IS NOT NULL AND b.first_follow_time IS NOT NULL
                             AND epoch(b.follow2_time) - epoch(b.first_follow_time) < 259200))
                    THEN 1 ELSE 0 END) * 100.0 / COUNT(*) FILTER (
                        WHERE b.follow_cutoff_time IS NOT NULL
                          AND b.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                          AND NOT (
                              b.follow_count = 1
                              AND b.lead_status = '跟进中'
                              AND b.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                          ))
                ELSE 0 END AS day3_3follow_rate,
            SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) AS valid_lead_count,
            CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) * 100.0 / COUNT(*) ELSE 0 END AS valid_lead_rate,
            SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END) AS valid_local_lead_count,
            SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) AS local_lead_count,
            COALESCE(sv.visit_count, 0) AS to_shop_count,
            CASE WHEN COUNT(*) > 0 THEN COALESCE(sv.visit_count, 0) * 100.0 / COUNT(*) ELSE 0 END AS lead_to_shop_rate,
            CASE WHEN SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                THEN COALESCE(sv.visit_count, 0) * 100.0 / SUM(CASE WHEN b.lead_status != '异地' THEN 1 ELSE 0 END) ELSE 0 END AS local_lead_to_shop_rate,
            CASE WHEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) > 0
                THEN COALESCE(sv.visit_count, 0) * 100.0 / SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) ELSE 0 END AS valid_lead_to_shop_rate,
            CASE WHEN SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                THEN COALESCE(sv.visit_count, 0) * 100.0 / SUM(CASE WHEN b.channel_3 != 'APP-试驾' AND b.lead_status NOT IN ('异地', '无效') AND b.lead_status != '异地' THEN 1 ELSE 0 END) ELSE 0 END AS valid_local_lead_to_shop_rate
        FROM base b
        LEFT JOIN shop_visit sv ON b.dealer_id = sv.dealer_id
        GROUP BY b.dealer_id, sv.visit_count
        ORDER BY {sort_by} {sort_direction}, b.dealer_id ASC
    """
    results = conn.execute(data_sql, params).fetchall()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "门店运营日报"

    p_label = f"{start_date}至{end_date}"
    headers = ['大区', '战区', '门店编号', '门店名称', '省份',
                f'{p_label}_N60线索数', f'{p_label}_N60及时跟进数',
                f'{p_label}_线索量', f'{p_label}_30分钟跟进数', f'{p_label}_30分钟跟进率(%)',
                f'{p_label}_三天三次跟进任务数', f'{p_label}_三天三次跟进数', f'{p_label}_三天三次跟进率(%)',
                f'{p_label}_有效线索量', f'{p_label}_线索有效率(%)',
                f'{p_label}_有效线索量_本地', f'{p_label}_线索量_本地',
                f'{p_label}_到店数', f'{p_label}_线索到店率(%)',
                f'{p_label}_线索到店率_本地(%)', f'{p_label}_有效线索到店率(%)',
                f'{p_label}_有效线索到店率_本地(%)']

    ws.append(headers)

    for row in results:
        row_data = [val if val is not None else '' for val in row]
        ws.append(row_data)

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = openpyxl.styles.Font(bold=True)
        cell.fill = openpyxl.styles.PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"门店运营日报_自定义_{start_date}_{end_date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )


if __name__ == '__main__':
    init_system(force_refresh=False)
    metadata_registry.initialize()
    print("Starting Leads Analytics Server on http://0.0.0.0:5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
