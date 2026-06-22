export function concentrationToColor(value, maxValue) {
  const normalized = Math.min(Math.max(value / maxValue, 0), 1);

  let r, g, b;

  if (normalized < 0.25) {
    const t = normalized / 0.25;
    r = 0;
    g = 0;
    b = Math.floor(255 * t);
  } else if (normalized < 0.5) {
    const t = (normalized - 0.25) / 0.25;
    r = 0;
    g = Math.floor(255 * t);
    b = 255;
  } else if (normalized < 0.75) {
    const t = (normalized - 0.5) / 0.25;
    r = Math.floor(255 * t);
    g = 255;
    b = Math.floor(255 * (1 - t));
  } else {
    const t = (normalized - 0.75) / 0.25;
    r = 255;
    g = Math.floor(255 * (1 - t));
    b = 0;
  }

  return { r, g, b };
}

export function concentrationToHex(value, maxValue) {
  const { r, g, b } = concentrationToColor(value, maxValue);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function riskLevelToColor(level) {
  const colors = {
    high: { r: 245, g: 108, b: 108 },
    medium: { r: 230, g: 162, b: 60 },
    low: { r: 103, g: 194, b: 58 },
    safe: { r: 103, g: 194, b: 58 },
  };
  return colors[level] || { r: 144, g: 147, b: 153 };
}

export function riskLevelToHex(level) {
  const { r, g, b } = riskLevelToColor(level);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function formatNumber(num, decimals = 1) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return Number(num).toFixed(decimals);
}

export function formatDateTime(date) {
  if (!date) return '--';
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTime(date) {
  if (!date) return '--';
  const d = new Date(date);
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
