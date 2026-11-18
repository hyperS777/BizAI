import sqlite3
ADDR_MAP = [
    ('Sector 125, Mohali', 30.6757, 76.7332, 'Mohali, Punjab'),
    ('Phase 7, Mohali', 30.7046, 76.7179, 'Mohali Phase 7, Punjab'),
    ('Connaught Place', 28.6315, 77.2167, 'Connaught Place, Delhi'),
    ('Indiranagar', 12.9784, 77.6408, 'Indiranagar, Bengaluru'),
    ('Bandra West', 19.0596, 72.8295, 'Bandra West, Mumbai'),
    ('Civil Lines, Jaipur', 26.9124, 75.7873, 'Civil Lines, Jaipur'),
]
conn = sqlite3.connect('C:/Users/asus/Desktop/code/Git/bizai/backend/bizai.db')
c = conn.cursor()
orders = c.execute('SELECT id, shipping_address FROM orders').fetchall()
for oid, addr in orders:
    for keyword, lat, lon, loc in ADDR_MAP:
        if keyword.lower() in (addr or '').lower():
            c.execute('UPDATE orders SET delivery_latitude=?, delivery_longitude=?, delivery_location=? WHERE id=?', (lat, lon, loc, oid))
            print(f'Updated order {oid}: {addr} -> {loc} ({lat}, {lon})')
            break
conn.commit()
conn.close()
print('Done')
