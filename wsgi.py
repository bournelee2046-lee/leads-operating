import sys
import os
import pathlib
sys.path.insert(0, os.path.dirname(__file__))

from backend.app_v2 import app, init_system, metadata_registry, duck_db
from backend.config import DUCKDB_PATH

init_system(force_refresh=False)
metadata_registry.initialize()

if duck_db is not None:
    try:
        conn = duck_db.get_connection()
        conn.execute('CHECKPOINT')
        conn.close()
    except:
        pass
    try:
        duck_db.close()
    except:
        pass
    import gc
    gc.collect()
    wal_path = pathlib.Path(str(DUCKDB_PATH) + '.wal')
    if wal_path.exists():
        try:
            wal_path.unlink()
        except:
            pass

if __name__ == '__main__':
    app.run()
