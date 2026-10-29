export function interpolate(points, fGHz) {
  if (!Number.isFinite(fGHz) || !points.length || fGHz < points[0].fGHz || fGHz > points.at(-1).fGHz) return null;
  const exact = points.find(p => p.fGHz === fGHz);
  if (exact) return exact.dbPerM;
  const i = points.findIndex(p => p.fGHz > fGHz);
  const a = points[i - 1], b = points[i];
  return a.dbPerM + (b.dbPerM - a.dbPerM) * (fGHz - a.fGHz) / (b.fGHz - a.fGHz);
}

export function estimateHarness(cable, { fGHz, lengthM, inlineBreakCount, interfaceCount = 2 + inlineBreakCount, connectorMinDb, connectorMaxDb, connectorMaxGHz, allowanceDb = null, referencePlaneConfirmed = false }) {
  if (!Number.isFinite(lengthM) || lengthM < 0.1 || lengthM > 30 || !Number.isInteger(inlineBreakCount) || inlineBreakCount < 0 || !Number.isInteger(interfaceCount) || interfaceCount < 0) throw new RangeError('线长须为 0.1–30 m，断点和对插界面数须为非负整数。');
  if (![connectorMinDb, connectorMaxDb].every(Number.isFinite) || connectorMinDb < 0 || connectorMaxDb < connectorMinDb) throw new RangeError('连接器假设损耗区间无效。');
  const dbPerM = interpolate(cable.points, fGHz);
  if (dbPerM === null) return { status: 'TBD', reason: '缺少该频段线材数据；禁止外推。', cable };
  const bareCableDb = lengthM * dbPerM;
  if (!Number.isFinite(connectorMaxGHz) || fGHz > connectorMaxGHz) return { status: 'TBD', reason: '裸线有数据，连接器假设未覆盖当前频段。', bareCableDb, cable };
  const minDb = bareCableDb + interfaceCount * connectorMinDb;
  const maxDb = bareCableDb + interfaceCount * connectorMaxDb;
  const comparable = referencePlaneConfirmed && Number.isFinite(allowanceDb) && allowanceDb >= 0;
  const marginDb = comparable ? allowanceDb - maxDb : null;
  const risk = !comparable ? '缺少同参考面预算，不能评估裕量'
    : allowanceDb < minDb ? '参考值已超预算'
    : allowanceDb < maxDb ? '接近边界 / 不确定' : '参考裕量为正，仍需实测';
  return { status: 'reference_only', cable, dbPerM, bareCableDb, minDb, maxDb, marginDb, risk, interfaceCount, referencePlaneConfirmed, rl: '待 VNA 验证；不叠加回损' };
}
