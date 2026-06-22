-- ============================================
-- 国家粮库熏蒸气体扩散可视化系统数据库Schema
-- ============================================

-- 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 仓房表
CREATE TABLE IF NOT EXISTS warehouse (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    length_m NUMERIC(10,2) NOT NULL,
    width_m NUMERIC(10,2) NOT NULL,
    height_m NUMERIC(10,2) NOT NULL,
    grain_type VARCHAR(50),
    capacity_tons NUMERIC(12,2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 传感器表
CREATE TABLE IF NOT EXISTS sensor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL,
    pos_x NUMERIC(10,2) NOT NULL,
    pos_y NUMERIC(10,2) NOT NULL,
    pos_z NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'online',
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_warehouse ON sensor(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sensor_status ON sensor(status);

-- 气体浓度读数表
CREATE TABLE IF NOT EXISTS gas_reading (
    id BIGSERIAL PRIMARY KEY,
    sensor_id UUID NOT NULL REFERENCES sensor(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
    concentration_ppm NUMERIC(12,4) NOT NULL,
    temperature NUMERIC(6,2),
    humidity NUMERIC(6,2),
    reading_time TIMESTAMP NOT NULL,
    status_code SMALLINT DEFAULT 0,
    raw_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gas_reading_warehouse ON gas_reading(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_gas_reading_sensor ON gas_reading(sensor_id);
CREATE INDEX IF NOT EXISTS idx_gas_reading_time ON gas_reading(reading_time DESC);
CREATE INDEX IF NOT EXISTS idx_gas_reading_warehouse_time ON gas_reading(warehouse_id, reading_time DESC);

-- 通风口状态表
CREATE TABLE IF NOT EXISTS vent_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    pos_x NUMERIC(10,2) NOT NULL,
    pos_y NUMERIC(10,2) NOT NULL,
    pos_z NUMERIC(10,2) NOT NULL,
    direction VARCHAR(10) DEFAULT 'out',
    is_open BOOLEAN DEFAULT false,
    fan_speed SMALLINT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vent_warehouse ON vent_state(warehouse_id);

-- 风险区域表
CREATE TABLE IF NOT EXISTS risk_zone (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
    name VARCHAR(100),
    risk_level VARCHAR(20) NOT NULL,
    concentration_min NUMERIC(12,4) NOT NULL,
    concentration_max NUMERIC(12,4) NOT NULL,
    voxel_data JSONB,
    calculated_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_zone_warehouse ON risk_zone(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_risk_zone_calculated ON risk_zone(calculated_at DESC);

-- 体素网格缓存表
CREATE TABLE IF NOT EXISTS voxel_grid (
    id BIGSERIAL PRIMARY KEY,
    warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
    grid_size INTEGER NOT NULL,
    snapshot_time TIMESTAMP NOT NULL,
    voxel_data BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voxel_grid_warehouse ON voxel_grid(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_voxel_grid_time ON voxel_grid(snapshot_time DESC);

-- 触发器：更新时间戳
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_warehouse_updated_at BEFORE UPDATE ON warehouse
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sensor_updated_at BEFORE UPDATE ON sensor
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入示例数据
INSERT INTO warehouse (code, name, length_m, width_m, height_m, grain_type, capacity_tons)
VALUES 
    ('WH-001', '一号平房仓', 60.0, 30.0, 8.0, '小麦', 5000),
    ('WH-002', '二号浅圆仓', 30.0, 30.0, 25.0, '玉米', 8000)
ON CONFLICT (code) DO NOTHING;

-- 插入示例传感器（一号仓）
INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'PH3-001', 'PH3', 10.0, 10.0, 2.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'PH3-002', 'PH3', 30.0, 15.0, 4.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'PH3-003', 'PH3', 50.0, 20.0, 3.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'PH3-004', 'PH3', 20.0, 25.0, 6.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'PH3-005', 'PH3', 45.0, 5.0, 5.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'TEMP-001', 'TEMP', 15.0, 15.0, 3.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (warehouse_id, code, type, pos_x, pos_y, pos_z, status)
SELECT w.id, 'HUM-001', 'HUM', 15.0, 15.0, 3.0, 'online'
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

-- 插入示例通风口
INSERT INTO vent_state (warehouse_id, code, name, pos_x, pos_y, pos_z, direction, is_open, fan_speed)
SELECT w.id, 'VENT-IN-01', '进风口1', 0.0, 15.0, 2.0, 'in', true, 50
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO vent_state (warehouse_id, code, name, pos_x, pos_y, pos_z, direction, is_open, fan_speed)
SELECT w.id, 'VENT-OUT-01', '排风口1', 60.0, 15.0, 7.0, 'out', true, 80
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO vent_state (warehouse_id, code, name, pos_x, pos_y, pos_z, direction, is_open, fan_speed)
SELECT w.id, 'VENT-OUT-02', '排风口2', 60.0, 5.0, 6.0, 'out', false, 0
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

INSERT INTO vent_state (warehouse_id, code, name, pos_x, pos_y, pos_z, direction, is_open, fan_speed)
SELECT w.id, 'VENT-IN-02', '进风口2', 0.0, 25.0, 4.0, 'in', false, 0
FROM warehouse w WHERE w.code = 'WH-001'
ON CONFLICT DO NOTHING;

-- 通风模拟任务表
CREATE TABLE IF NOT EXISTS ventilation_simulation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    vent_config JSONB NOT NULL,
    grid_size INTEGER NOT NULL DEFAULT 10,
    total_seconds INTEGER NOT NULL DEFAULT 3600,
    time_step_seconds INTEGER NOT NULL DEFAULT 60,
    initial_snapshot_time TIMESTAMP,
    progress INTEGER DEFAULT 0,
    results JSONB,
    error_message TEXT,
    canceled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vent_sim_warehouse ON ventilation_simulation(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_vent_sim_status ON ventilation_simulation(status);
CREATE INDEX IF NOT EXISTS idx_vent_sim_created ON ventilation_simulation(created_at DESC);

CREATE TRIGGER update_vent_sim_updated_at BEFORE UPDATE ON ventilation_simulation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
