const STATUSES = ['verified_public', 'user_confirmed_vendor', 'pending_vendor', 'inferred', 'unavailable', 'demo', 'synthetic'];
const CONFIRMED = new Set(['verified_public', 'user_confirmed_vendor', 'demo', 'synthetic']);
const SOURCE_KEYS = ['title', 'url', 'revision', 'section', 'checkedAt', 'visibility'];
const MASK_KEYS = ['component', 'metric', 'comparison', 'referencePlane', 'referenceOhms', 'segments', 'verificationStatus', 'source'];
const RULE_KEYS = ['ruleId', 'vendor', 'serializer', 'deserializer', 'direction', 'media', 'physicalLinkCounts', 'verificationStatus', 'source', 'rate', 'lossMasks', 'notes'];

function fail(path, message) {
  throw new TypeError(path + ': ' + message);
}

function object(value, keys, required, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected plain object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(path + '.' + key, 'unknown field');
  for (const key of required) if (!Object.hasOwn(value, key)) fail(path + '.' + key, 'required field');
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected nonempty string');
}

function number(value, path, { integer = false, zero = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      (zero ? value < 0 : value <= 0) || (integer && !Number.isSafeInteger(value))) fail(path, 'expected finite ' + (integer ? 'integer ' : '') + (zero ? '>= 0' : '> 0'));
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, 'expected one of ' + allowed.join(', '));
}

function list(value, path, check) {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'expected nonempty array');
  if (new Set(value).size !== value.length) fail(path, 'duplicate value');
  value.forEach((item, index) => check(item, path + '[' + index + ']'));
}

function source(value, path) {
  object(value, SOURCE_KEYS, SOURCE_KEYS, path);
  for (const key of SOURCE_KEYS.filter(key => key !== 'url')) text(value[key], path + '.' + key);
  oneOf(value.visibility, ['public', 'restricted', 'synthetic'], path + '.visibility');
  if (value.url !== '' || value.visibility === 'public') {
    let url;
    try { url = new URL(value.url); } catch { fail(path + '.url', 'invalid URL'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail(path + '.url', 'expected HTTP(S) URL without credentials');
  }
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value.checkedAt) ||
      !Number.isFinite(Date.parse(value.checkedAt)) ||
      new Date(value.checkedAt.slice(0, 10)).toISOString().slice(0, 10) !== value.checkedAt.slice(0, 10)) fail(path + '.checkedAt', 'expected valid ISO date or datetime');
}

function curve(segment, frequency) {
  const [a, b, c] = segment.coefficients;
  return segment.model === 'sqrt-linear' ? a * Math.sqrt(frequency) + b * frequency + c : a * frequency * frequency + b * frequency + c;
}

function mask(value, path) {
  const required = MASK_KEYS.filter(key => key !== 'source');
  object(value, MASK_KEYS, required, path);
  oneOf(value.component, ['total', 'cable', 'pcb_tx', 'pcb_rx'], path + '.component');
  oneOf(value.metric, ['S21', 'Sdd21', 'S11', 'Sdd11'], path + '.metric');
  oneOf(value.comparison, ['min', 'max'], path + '.comparison');
  text(value.referencePlane, path + '.referencePlane');
  number(value.referenceOhms, path + '.referenceOhms');
  oneOf(value.verificationStatus, STATUSES, path + '.verificationStatus');
  if (value.source !== undefined) source(value.source, path + '.source');
  if (!Array.isArray(value.segments)) fail(path + '.segments', 'expected array');
  let previous;
  value.segments.forEach((segment, index) => {
    const itemPath = path + '.segments[' + index + ']';
    object(segment, ['rangeGHz', 'coefficients', 'model'], ['rangeGHz', 'coefficients'], itemPath);
    if (segment.model !== undefined) oneOf(segment.model, ['polynomial', 'sqrt-linear'], itemPath + '.model');
    if (!Array.isArray(segment.rangeGHz) || segment.rangeGHz.length !== 2) fail(itemPath + '.rangeGHz', 'expected [lo, hi]');
    segment.rangeGHz.forEach((v, i) => number(v, itemPath + '.rangeGHz[' + i + ']', { zero: true }));
    const [lo, hi] = segment.rangeGHz;
    if (lo >= hi) fail(itemPath + '.rangeGHz', 'lo must be smaller than hi');
    if (!Array.isArray(segment.coefficients) || segment.coefficients.length !== 3 ||
        !segment.coefficients.every(v => typeof v === 'number' && Number.isFinite(v))) fail(itemPath + '.coefficients', 'expected finite [a, b, c]');
    if (previous && lo < previous.rangeGHz[1]) fail(itemPath, 'segments must be ordered and not overlap');
    previous = segment;
  });
}

function rule(value, path) {
  object(value, RULE_KEYS, RULE_KEYS.filter(key => key !== 'notes'), path);
  for (const key of ['ruleId', 'vendor', 'serializer', 'deserializer']) text(value[key], path + '.' + key);
  oneOf(value.direction, ['display', 'camera', 'both'], path + '.direction');
  list(value.media, path + '.media', (v, p) => oneOf(v, ['STP', 'Coax'], p));
  list(value.physicalLinkCounts, path + '.physicalLinkCounts', (v, p) => number(v, p, { integer: true }));
  oneOf(value.verificationStatus, STATUSES, path + '.verificationStatus');
  source(value.source, path + '.source');
  if (value.notes !== undefined) {
    if (Array.isArray(value.notes)) value.notes.forEach((v, i) => text(v, path + '.notes[' + i + ']'));
    else text(value.notes, path + '.notes');
  }
  const rate = value.rate;
  const rateKeys = ['kind', 'frameBits', 'lineRateGbps', 'modulation', 'allowEvenSplit', 'pixelsPerClockSupported', 'pclkMinMHz', 'pclkMaxMHz'];
  object(rate, rateKeys, ['kind', 'modulation'], path + '.rate');
  oneOf(rate.kind, ['frame', 'fixed', 'unavailable'], path + '.rate.kind');
  oneOf(rate.modulation, ['NRZ', 'PAM4', 'unknown'], path + '.rate.modulation');
  for (const key of ['frameBits', 'lineRateGbps', 'pclkMinMHz', 'pclkMaxMHz']) if (rate[key] !== undefined) number(rate[key], path + '.rate.' + key, { integer: key === 'frameBits' });
  if (rate.kind === 'frame' && rate.frameBits === undefined) fail(path + '.rate.frameBits', 'required for frame rate');
  if (rate.kind === 'fixed' && rate.lineRateGbps === undefined) fail(path + '.rate.lineRateGbps', 'required for fixed rate');
  if ((rate.kind !== 'frame' && rate.frameBits !== undefined) || (rate.kind !== 'fixed' && rate.lineRateGbps !== undefined)) fail(path + '.rate', 'rate value must match kind');
  if (rate.allowEvenSplit !== undefined && typeof rate.allowEvenSplit !== 'boolean') fail(path + '.rate.allowEvenSplit', 'expected boolean');
  if (rate.pixelsPerClockSupported !== undefined) list(rate.pixelsPerClockSupported, path + '.rate.pixelsPerClockSupported', (v, p) => number(v, p, { integer: true }));
  if (rate.pclkMinMHz !== undefined && rate.pclkMaxMHz !== undefined && rate.pclkMinMHz > rate.pclkMaxMHz) fail(path + '.rate', 'PCLK range is reversed');
  if (!Array.isArray(value.lossMasks)) fail(path + '.lossMasks', 'expected array');
  value.lossMasks.forEach((v, i) => mask(v, path + '.lossMasks[' + i + ']'));
}

// Validation completes before returning a detached pack; existing state is never mutated.
export function validateRulePack(obj, existingRules = []) {
  object(obj, ['schemaVersion', 'packId', 'rules'], ['schemaVersion', 'packId', 'rules'], 'pack');
  if (obj.schemaVersion !== 1) fail('pack.schemaVersion', 'expected 1');
  text(obj.packId, 'pack.packId');
  if (!Array.isArray(existingRules)) fail('existingRules', 'expected array');
  if (!Array.isArray(obj.rules) || obj.rules.length === 0) fail('pack.rules', 'expected nonempty array');
  const ids = new Set(existingRules.map(v => v.ruleId));
  obj.rules.forEach((value, index) => {
    rule(value, 'pack.rules[' + index + ']');
    if (ids.has(value.ruleId)) fail('pack.rules[' + index + '].ruleId', 'duplicate ruleId');
    ids.add(value.ruleId);
  });
  return structuredClone(obj);
}

export function evaluateMask(value, fGHz) {
  try {
    mask(value, 'mask');
    number(fGHz, 'fGHz');
  } catch (error) {
    return { status: 'Unsupported', signedDb: null, positiveLossDb: null, warning: error.message };
  }
  const segments = value.segments.filter(v => fGHz >= v.rangeGHz[0] && fGHz <= v.rangeGHz[1]);
  if (!segments.length) return { status: 'TBD', signedDb: null, positiveLossDb: null, warning: 'Frequency is outside the available mask segments; no extrapolation.' };
  const values = segments.map(segment => curve(segment, fGHz));
  const signedDb = value.comparison === 'min' ? Math.max(...values) : Math.min(...values);
  if (!Number.isFinite(signedDb)) return { status: 'Unsupported', signedDb: null, positiveLossDb: null, warning: 'Mask calculation overflow.' };
  const confirmed = CONFIRMED.has(value.verificationStatus);
  const warnings = [];
  if (!confirmed) warnings.push('Mask is not verified: ' + value.verificationStatus + '.');
  if (value.verificationStatus === 'user_confirmed_vendor') warnings.push('Vendor value is user confirmed; no public written correction has been obtained.');
  if (signedDb > 0) warnings.push('Positive signed dB does not describe positive attenuation; no positive-loss value is provided.');
  return { status: confirmed ? 'OK' : 'TBD', signedDb, positiveLossDb: signedDb <= 0 ? -signedDb : null, ...(warnings.length ? { warning: warnings.join(' ') } : {}) };
}

export function calculateRate(input, selectedRule) {
  const result = {
    status: 'OK', warnings: [], videoPayloadGbps: null, clockedVideoGbps: null,
    pclkMHz: null, equivalentPixelMHz: null, lineRateGbpsPerLink: null,
    totalLineRateGbps: null, symbolRateGBd: null, nyquistGHz: null, csiCapacityGbps: null,
  };
  const warn = (status, message) => {
    if (result.status !== 'Unsupported') result.status = status;
    result.warnings.push(message);
  };
  const inputKeys = ['direction', 'media', 'pclkMode', 'pclkMHz', 'width', 'height', 'refreshHz', 'blankingFactor', 'hTotal', 'vTotal', 'pixelsPerClock', 'bitsPerPixel', 'serdesPhysicalLinkCount', 'deserializerVideoOutputCount', 'fps', 'rawBits', 'csiLanes', 'csiLaneGbps'];
  try {
    object(input, inputKeys, [], 'input');
    rule(selectedRule, 'rule');
    for (const key of inputKeys.filter(key => !['direction', 'media', 'pclkMode'].includes(key))) {
      if (input[key] !== undefined) number(input[key], 'input.' + key, { integer: ['width', 'height', 'hTotal', 'vTotal', 'pixelsPerClock', 'bitsPerPixel', 'serdesPhysicalLinkCount', 'deserializerVideoOutputCount', 'rawBits', 'csiLanes'].includes(key) });
    }
    if (input.direction !== undefined) oneOf(input.direction, ['display', 'camera'], 'input.direction');
    if (input.media !== undefined) oneOf(input.media, ['STP', 'Coax'], 'input.media');
    if (input.blankingFactor !== undefined && input.blankingFactor < 1) fail('input.blankingFactor', 'must be >= 1');
  } catch (error) {
    warn('Unsupported', error.message);
    return result;
  }
  const direction = input.direction ?? (selectedRule.direction === 'both' ? 'display' : selectedRule.direction);
  const rate = selectedRule.rate;
  const physicalLinks = input.serdesPhysicalLinkCount ?? 1;
  const pixelsPerClock = input.pixelsPerClock ?? 1;
  if (selectedRule.direction !== 'both' && direction !== selectedRule.direction) warn('Unsupported', 'Input direction does not match this rule.');
  if (input.media !== undefined && !selectedRule.media.includes(input.media)) warn('Unsupported', 'Media is not supported by this rule.');
  if (!selectedRule.physicalLinkCounts.includes(physicalLinks)) warn('Unsupported', 'Physical link count is not supported by this rule.');
  if (selectedRule.verificationStatus === 'user_confirmed_vendor') result.warnings.push('Vendor value is user confirmed; no public written correction has been obtained.');
  if (direction === 'camera') {
    if (input.width === undefined || input.height === undefined || input.fps === undefined || input.rawBits === undefined) warn('Unsupported', 'Camera payload requires width, height, fps and rawBits.');
    else result.videoPayloadGbps = input.width * input.height * input.fps * input.rawBits / 1e9;
    if ((input.csiLanes === undefined) !== (input.csiLaneGbps === undefined)) warn('Unsupported', 'CSI capacity requires both csiLanes and csiLaneGbps.');
    else if (input.csiLanes !== undefined) {
      result.csiCapacityGbps = input.csiLanes * input.csiLaneGbps;
      if (result.videoPayloadGbps > result.csiCapacityGbps) warn('Unsupported', 'CSI transport capacity is below net image payload.');
    }
    result.warnings.push('Camera payload and nominal CSI capacity exclude CSI overhead; CSI-to-SerDes protocol mapping is not inferred.');
  } else {
    const bitsPerPixel = input.bitsPerPixel ?? 24;
    const hasResolution = input.width !== undefined && input.height !== undefined && input.refreshHz !== undefined;
    const activePixelMHz = hasResolution ? input.width * input.height * input.refreshHz / 1e6 : null;
    if (hasResolution) result.videoPayloadGbps = activePixelMHz * bitsPerPixel / 1000;
    else result.warnings.push('Complete active resolution and refresh are absent; net video payload is unavailable.');
    if (input.pclkMode === 'spec') {
      if (input.pclkMHz === undefined) warn('Unsupported', 'Specification mode requires pclkMHz.');
      else result.pclkMHz = input.pclkMHz;
    } else if (input.pclkMode === 'estimate') {
      if (!hasResolution || input.blankingFactor === undefined) warn('Unsupported', 'Estimate mode requires width, height, refreshHz and blankingFactor >= 1.');
      else {
        result.pclkMHz = activePixelMHz * input.blankingFactor / pixelsPerClock;
        result.warnings.push('PCLK is estimated from an explicit blanking factor, not a panel specification.');
      }
    } else if (input.pclkMode === 'timing') {
      if (input.hTotal === undefined || input.vTotal === undefined || input.refreshHz === undefined) warn('Unsupported', 'Timing mode requires hTotal, vTotal and refreshHz.');
      else {
        result.pclkMHz = input.hTotal * input.vTotal * input.refreshHz / 1e6 / pixelsPerClock;
        if ((input.width !== undefined && input.hTotal < input.width) || (input.height !== undefined && input.vTotal < input.height)) warn('Unsupported', 'Total timing dimensions cannot be smaller than active dimensions.');
      }
    } else warn('Unsupported', 'Choose pclkMode: spec, estimate or timing.');
    if (result.pclkMHz !== null) {
      result.equivalentPixelMHz = result.pclkMHz * pixelsPerClock;
      result.clockedVideoGbps = result.equivalentPixelMHz * bitsPerPixel / 1000;
      if (activePixelMHz !== null && result.equivalentPixelMHz + 1e-9 < activePixelMHz) warn('Unsupported', 'PCLK provides fewer pixels than the requested active image.');
      if ((rate.pclkMinMHz !== undefined && result.pclkMHz < rate.pclkMinMHz) || (rate.pclkMaxMHz !== undefined && result.pclkMHz > rate.pclkMaxMHz)) warn('Unsupported', 'PCLK is outside the rule capability range; capability does not replace actual panel PCLK.');
    }
  }
    let physicalConfirmed = true;
    if (direction === 'display' && pixelsPerClock > 1 && !rate.pixelsPerClockSupported?.includes(pixelsPerClock)) {
      warn('TBD', 'Multiple-pixel packing has not been confirmed for this rule.');
      physicalConfirmed = false;
    } else if (direction === 'display' && rate.pixelsPerClockSupported && !rate.pixelsPerClockSupported.includes(pixelsPerClock)) {
      warn('Unsupported', 'Pixels per clock is not supported by this rule.');
      physicalConfirmed = false;
    }
    if (physicalLinks > 1 && rate.allowEvenSplit !== true) {
      warn('TBD', 'Even splitting across physical links has not been confirmed.');
      physicalConfirmed = false;
    }
    if (!selectedRule.physicalLinkCounts.includes(physicalLinks)) physicalConfirmed = false;
    if (!CONFIRMED.has(selectedRule.verificationStatus) || rate.kind === 'unavailable') {
      warn('TBD', 'Physical rate is unavailable or unconfirmed for this rule.');
      physicalConfirmed = false;
    }
    if (physicalConfirmed && rate.kind === 'frame' && result.equivalentPixelMHz === null) {
      warn('TBD', 'Frame-based physical rate requires confirmed PCLK and pixel packing.');
    }
    if (physicalConfirmed && (rate.kind === 'fixed' || result.equivalentPixelMHz !== null)) {
      result.lineRateGbpsPerLink = rate.kind === 'fixed' ? rate.lineRateGbps : result.equivalentPixelMHz * rate.frameBits / 1000 / physicalLinks;
      result.totalLineRateGbps = result.lineRateGbpsPerLink * physicalLinks;
      const payload = result.videoPayloadGbps ?? result.clockedVideoGbps;
      if (payload !== null && result.totalLineRateGbps + 1e-9 < payload) warn('Unsupported', 'Total physical line capacity is below the video payload.');
      if (rate.kind === 'frame' && result.clockedVideoGbps !== null && result.totalLineRateGbps + 1e-9 < result.clockedVideoGbps) warn('Unsupported', 'Uncompressed pixel data exceeds the selected frame capacity.');
      if (rate.modulation === 'unknown') warn('TBD', 'Modulation is unknown; symbol rate and Nyquist frequency are unavailable.');
      else {
        result.symbolRateGBd = result.lineRateGbpsPerLink / (rate.modulation === 'PAM4' ? 2 : 1);
        result.nyquistGHz = result.symbolRateGBd / 2;
      }
    }
    result.warnings.push('Deserializer video output count does not divide physical SerDes rate. Video payload is not physical line rate.');
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'number' && !Number.isFinite(result[key])) {
      result[key] = null;
      warn('Unsupported', 'Calculation overflow: ' + key + '.');
    }
  }
  return result;
}

