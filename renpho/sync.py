#!/usr/bin/env python3
import os, sys, json, logging, psycopg2
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from renpho import RenphoClient, RenphoAPIError

load_dotenv(Path(__file__).parent / '.env')
logging.basicConfig(level=logging.INFO, format='%(asctime)s  %(levelname)-8s  %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
log = logging.getLogger('renpho-sync')
TOKEN_CACHE = Path(__file__).parent / '.token_cache.json'

def get_attr(obj, *names):
    for n in names:
        if hasattr(obj, n): return n
    return None

def load_token():
    try:
        data = json.loads(TOKEN_CACHE.read_text())
        age  = (datetime.now(tz=timezone.utc) - datetime.fromisoformat(data['saved_at'])).days
        if age < 20 and data.get('token') and data.get('user_id'):
            log.info(f'Using cached token (age: {age}d) — skipping login.')
            return data['token'], data['user_id']
        log.info('Token expired — re-login.')
    except: pass
    return None, None

def save_token(token, user_id):
    TOKEN_CACHE.write_text(json.dumps({'token': token, 'user_id': str(user_id), 'saved_at': datetime.now(tz=timezone.utc).isoformat()}))
    log.info('Token cached.')

def clear_token():
    try: TOKEN_CACHE.unlink()
    except: pass

def get_token(client):
    a = get_attr(client, 'token', '_token', 'session_token')
    return getattr(client, a) if a else None

def get_uid(client):
    a = get_attr(client, 'user_id', '_user_id', 'userId')
    return getattr(client, a) if a else None

def inject_token(client, token, user_id):
    ta = get_attr(client, 'token', '_token', 'session_token')
    ua = get_attr(client, 'user_id', '_user_id', 'userId')
    if ta: setattr(client, ta, token)
    if ua: setattr(client, ua, user_id)
    if hasattr(client, 'session') and hasattr(client.session, 'headers'):
        client.session.headers['Token'] = token
    return ta is not None

def kg_to_lbs(kg): return round(float(kg) * 2.20462, 2) if kg else None

def parse_ts(m):
    ts = m.get('timeStamp') or m.get('time_stamp') or m.get('timestamp')
    if ts:
        try: return datetime.fromtimestamp(float(ts), tz=timezone.utc)
        except: pass
    lca = m.get('localCreatedAt')
    if lca:
        try: return datetime.strptime(lca, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        except: pass
    return datetime.now(tz=timezone.utc)

def parse(m, user_id):
    dt = parse_ts(m)
    return {
        'measured_at': dt.isoformat(), 'measurement_date': dt.date().isoformat(),
        'weight_lbs': kg_to_lbs(m.get('weight')),
        'body_fat_pct': float(m['bodyfat']) if m.get('bodyfat') else None,
        'muscle_mass_lbs': kg_to_lbs(m.get('muscle')),
        'bone_mass_lbs': kg_to_lbs(m.get('bone')),
        'body_water_pct': float(m['water']) if m.get('water') else None,
        'visceral_fat': int(m['visfat']) if m.get('visfat') else None,
        'bmi': float(m['bmi']) if m.get('bmi') else None,
        'bmr_kcal': int(m['bmr']) if m.get('bmr') else None,
        'metabolic_age': int(m['bodyage']) if m.get('bodyage') else None,
        'source': 'renpho', 'renpho_user_id': str(user_id),
    }

def get_conn():
    return psycopg2.connect(host=os.getenv('DB_HOST','postgres'), port=int(os.getenv('DB_PORT',5432)),
        dbname=os.getenv('DB_NAME','fittrack'), user=os.getenv('DB_USER','fittrack'),
        password=os.getenv('DB_PASSWORD'), connect_timeout=10)

def last_sync_dt(cur):
    cur.execute("SELECT MAX(measured_at) FROM body_metrics WHERE source='renpho'")
    row = cur.fetchone()
    return row[0] if (row and row[0]) else None

def upsert(cur, m):
    m["db_user_id"] = "00000000-0000-0000-0000-000000000001"
    cur.execute("""INSERT INTO body_metrics (user_id,measured_at,measurement_date,weight_lbs,body_fat_pct,
        muscle_mass_lbs,bone_mass_lbs,body_water_pct,visceral_fat,bmi,bmr_kcal,metabolic_age,source,renpho_user_id)
        VALUES (%(db_user_id)s,%(measured_at)s,%(measurement_date)s,%(weight_lbs)s,%(body_fat_pct)s,%(muscle_mass_lbs)s,
        %(bone_mass_lbs)s,%(body_water_pct)s,%(visceral_fat)s,%(bmi)s,%(bmr_kcal)s,%(metabolic_age)s,
        %(source)s,%(renpho_user_id)s)
        ON CONFLICT (renpho_user_id,measured_at) WHERE source='renpho' DO NOTHING""", m)
    return cur.rowcount == 1

def fetch(client):
    info   = client.get_device_info()
    scales = info.get('scale', [])
    if not scales: raise RuntimeError('No scales found.')
    t = scales[0]
    log.info(f"Scale: {t['tableName']}, {t['count']} records.")
    return client.get_measurements(table_name=t['tableName'], user_id=client.user_id, total_count=t['count'])

def main():
    email    = os.getenv('RENPHO_EMAIL')
    password = os.getenv('RENPHO_PASSWORD')
    if not email or not password: log.error('Credentials missing'); sys.exit(1)

    try:
        conn = get_conn(); conn.autocommit = False; cur = conn.cursor()
        log.info('Connected to PostgreSQL.')
    except Exception as e: log.error(f'DB error: {e}'); sys.exit(1)

    try:
        last_dt = last_sync_dt(cur)
        log.info(f'Last sync: {last_dt or "never"}')

        cached_token, cached_uid = load_token()
        client = RenphoClient(email, password)

        if cached_token and inject_token(client, cached_token, cached_uid):
            log.info('Injected cached token — attempting to skip login.')
            try:
                measurements = fetch(client)
            except Exception as e:
                log.warning(f'Cached token failed ({e}) — re-logging in.')
                clear_token()
                client = RenphoClient(email, password)
                client.login()
                log.info(f'Login OK. User: {get_uid(client)}')
                save_token(get_token(client), get_uid(client))
                measurements = fetch(client)
        else:
            log.info(f'Logging in as {email}...')
            client.login()
            log.info(f'Login OK. User: {get_uid(client)}')
            save_token(get_token(client), get_uid(client))
            measurements = fetch(client)

        log.info(f'Fetched {len(measurements)} measurement(s).')

        # Sort newest first — critical fix so new weigh-ins are found
        measurements.sort(key=lambda m: float(m.get('timeStamp') or 0), reverse=True)

        if last_dt:
            before = len(measurements)
            measurements = [m for m in measurements if parse_ts(m) > last_dt]
            log.info(f'{len(measurements)} new (skipped {before - len(measurements)}).')

        if not measurements: log.info('Nothing new.'); return

        inserted = skipped = 0
        for raw in measurements:
            try:
                p = parse(raw, get_uid(client))
                if upsert(cur, p):
                    inserted += 1
                    log.info(f"  + {p['measurement_date']}  {p['weight_lbs']} lbs")
                else: skipped += 1
            except Exception as e: log.warning(f'  Skipped: {e}')

        conn.commit()
        log.info(f'Done — {inserted} inserted, {skipped} skipped.')

    except RenphoAPIError as e: conn.rollback(); log.error(f'Renpho error: {e}'); sys.exit(1)
    except Exception as e: conn.rollback(); log.error(f'Failed: {e}'); sys.exit(1)
    finally: cur.close(); conn.close()

if __name__ == '__main__': main()
