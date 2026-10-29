import { calculateRate, evaluateMask, validateRulePack } from './engine.mjs';
import { publicRules, cables, connectors } from './catalog.mjs';
import { importRules } from './import-rules.mjs';
import { estimateHarness } from './harness.mjs';
import { parseTouchstone, deriveMetrics, compareMeasurement } from './touchstone.mjs';
import { compareInsertionBudget } from './budget.mjs';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const fmt = (v, digits = 4) => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : v === -Infinity ? '−∞' : v === Infinity ? '+∞' : 'TBD';
const $ = id => document.getElementById(id);
const statusText = { verified_public:'公开原始资料', user_confirmed_vendor:'用户转述厂家确认', pending_vendor:'待厂家复核', inferred:'工程推断', unavailable:'资料不足', demo:'合成演示', synthetic:'合成演示' };
const warningText = value => ({
  'Complete active resolution and refresh are absent; net video payload is unavailable.':'未填写完整有效分辨率与刷新率，净载荷保留为 TBD。',
  'Deserializer video output count does not divide physical SerDes rate. Video payload is not physical line rate.':'屏端视频输出路数不分摊 SerDes 物理线速；视频载荷与物理线速分别计算。',
  'Vendor value is user confirmed; no public written correction has been obtained.':'厂家确认由用户转述，尚未取得公开书面更正。',
  'PCLK is estimated from an explicit blanking factor, not a panel specification.':'PCLK 来自明示的消隐系数估算，并非屏厂正式规格。',
  'PCLK provides fewer pixels than the requested active image.':'PCLK 提供的等效像素率低于有效画面需求，请核对像素/时钟、时序和刷新率。',
  'PCLK is outside the rule capability range; capability does not replace actual panel PCLK.':'PCLK 超出当前规则的适用范围；芯片能力上限不能替代屏幕实际 PCLK。',
  'Multiple-pixel packing has not been confirmed for this rule.':'当前规则未确认双像素封装关系，物理线速保留 TBD。',
  'Physical rate is unavailable or unconfirmed for this rule.':'当前组合的物理线速规则未取得可靠依据，保留 TBD。',
  'Total physical line capacity is below the video payload.':'物理通道总传输能力低于视频净载荷，当前模式不适用。',
  'Uncompressed pixel data exceeds the selected frame capacity.':'无压缩像素数据超过所选帧容量，请核对每像素位数和帧模式。',
  'Modulation is unknown; symbol rate and Nyquist frequency are unavailable.':'调制方式未确认，不推测符号率或 Nyquist。',
  'Even splitting across physical links has not been confirmed.':'尚未确认视频在多个物理通道均分，不自动除以链路数。',
}[value] ?? value);
const sourceLink = source => source?.url && /^https?:\/\//.test(source.url) ? `<a href="${e(source.url)}" target="_blank" rel="noreferrer">${e(source.title)}</a>` : e(source?.title ?? 'TBD');
const field = (label, id, value = '', extra = '') => `<label>${label}<input id="${id}" name="${id}" type="number" step="any" value="${value}" ${extra}></label>`;
const demoSource = { title:'Synthetic arithmetic example', url:'', revision:'1', section:'Not a vendor specification', checkedAt:'2026-10-29', visibility:'synthetic' };
const demos = [32,40].map(frameBits => ({ ruleId:`demo-frame-${frameBits}`, vendor:'合成演示（非厂商规格）', serializer:'Demo SER', deserializer:'Demo DES', direction:'display', media:['STP','Coax'], physicalLinkCounts:[1,2], verificationStatus:'demo', source:demoSource, rate:{kind:'frame',frameBits,modulation:'NRZ',allowEvenSplit:true,pixelsPerClockSupported:[1,2]}, lossMasks:[], notes:`${frameBits} bit 数学演示；不代表任何实际型号。` }));
let rules = [...publicRules, ...demos];
validateRulePack({ schemaVersion:1, packId:'bundled', rules });
let currentReport = null, harnessReport = null, measurement = null, measurementReport = null;
const importedSources = new Map();

$('app').innerHTML = `
<header><a class="brand" href="./">loss<span>SerDes 通道预算</span></a><span class="local-tag">本地计算 · 无上传</span><button id="print" class="quiet">打印报告</button></header>
<div class="page-intro"><div><p class="eyebrow">AUTOMOTIVE SIGNAL INTEGRITY</p><h1>把显示需求，变成链路要求。</h1><p>先明确物理线速与规格预算，再判断线束参考方案。</p></div><div class="import-actions"><label class="button secondary" for="rule-file">导入本地规则包</label><input id="rule-file" type="file" accept=".json,application/json" hidden><button id="clear-import" class="quiet">清除导入</button></div></div>
<p id="import-status" class="notice" role="status">当前使用公开规则；未加载的内部授权参数显示 TBD。导入文件仅保留于内存，刷新后清除。</p>
<div class="workbench"><aside><form id="settings">
<div class="section-heading"><span class="step">01</span><h2>定义视频与链路</h2></div>
<label>应用场景<select id="direction"><option value="display">显示屏</option><option value="camera">摄像头</option></select></label>
<label>厂商 / 规则来源<select id="vendor"></select></label>
<label>加串器 → 解串器 / 工作模式<select id="rule"></select></label>
<div class="two"><label>传输介质<select id="media"></select></label><label>高速物理通道数<select id="physical"></select></label></div>
<p class="hint">这里是 SER → DES 之间的高速线束条数，与屏端 LVDS 输出路数分别记录。</p>
<div id="display-inputs"><label>PCLK 输入方式<select id="pclk-mode"><option value="spec">FOG / 模组规格书 PCLK</option><option value="estimate">没有规格书，按有效分辨率估算</option><option value="timing">完整时序 Htotal × Vtotal</option></select></label>
<div id="spec-inputs">${field('PCLK / DCLK（MHz）','pclk',46,'min="0.001"')}<label>来源备注<select id="pclk-source"><option value="fog_spec">FOG / 模组规格</option><option value="host_confirmed">主机实际时序 / 实测确认</option></select></label></div>
<div id="resolution-inputs"><div class="two">${field('Hactive（像素）','width','','min="1"')}${field('Vactive（像素）','height','','min="1"')}</div>${field('刷新率（Hz）','refresh','','min="0.001"')}<p class="hint">规格书模式可留空；未填写时不推断有效画面净载荷。</p></div>
<div id="estimate-inputs" hidden>${field('消隐估算系数 K（≥ 1）','blanking',1.2,'min="1"')}<p class="warning">1.20 仅为工程示例初值，并非屏幕正式规格。</p></div>
<div id="timing-inputs" class="two" hidden>${field('Htotal','htotal',2200,'min="1"')}${field('Vtotal','vtotal',1125,'min="1"')}</div>
<details><summary>像素格式与高级时序</summary>${field('每像素位数（RGB888 = 24）','bpp',24,'min="1"')}<div class="two"><label>像素 / 时钟<select id="ppc"><option value="1">1 pixel / clock</option><option value="2">2 pixels / clock</option></select></label><label>DES 视频输出路数<select id="video-outputs"><option value="1">1 路</option><option value="2">2 路</option></select></label></div><div class="two">${field('规格书 Min PCLK（MHz，可选）','pclk-min','','min="0.001"')}${field('规格书 Max PCLK（MHz，可选）','pclk-max','','min="0.001"')}</div><p class="hint">默认屏端时序即加串器承载时序；若有缩放、压缩或异步刷新，请输入实际等效时序。双像素封装关系仍由具体规则确认。</p></details></div>
<div id="camera-inputs" hidden><div class="two">${field('图像宽度','camera-width',1920,'min="1"')}${field('图像高度','camera-height',1080,'min="1"')}</div><div class="two">${field('帧率（FPS）','camera-fps',30,'min="0.001"')}${field('RAW bit depth','raw-bits',12,'min="1"')}</div><details><summary>CSI-2 传输能力（可选）</summary><div class="two">${field('CSI data lanes','csi-lanes','','min="1"')}${field('每 lane 速率（Gbps）','csi-rate','','min="0.001"')}</div><p class="hint">CSI 能力不等于 SerDes 物理线速，净载荷不含 CSI 包开销。</p></details></div>
</form></aside><main>
<div class="result-heading"><div class="section-heading"><span class="step">02</span><h2>链路要求</h2></div><span id="result-state" class="state"></span></div>
<div id="rate-results" aria-live="polite"></div><div id="warnings"></div>
<section class="spec-section"><div class="section-heading"><h3>IL / RL 规格预算</h3><label class="inline">查询频点（GHz）<input id="frequency" type="number" min="0.0001" step="any" placeholder="自动采用 Nyquist"></label></div><p class="hint">插损显示为正数大小，同时保留 signed S 参数限值。回损按反射上限单独验证，不与其他组件相加。</p><div id="mask-results"></div><label class="check"><input type="checkbox" id="additive-confirmed">已确认厂商允许组件 IL 预算相加，且 PCB / 线束参考面不重复</label><div id="budget-result"></div><div class="chart-control"><label>曲线<select id="chart-metric"><option value="IL">插损大小（dB）</option><option value="RL">回波损耗（dB）</option></select></label></div><div id="chart"></div><div id="source"></div></section>
<div class="report-actions"><button id="export-si">导出 SI 设计要求 · JSON</button><button id="export-csv" class="secondary">规格表 CSV</button></div>
<details class="optional" id="harness-panel"><summary><span class="step">03</span> 线束方案预评估 <small>可选 · 参考估算</small></summary><p>基于公开裸线样本、长度和对插假设。不会改变上面的链路要求。</p><div class="three">${field('总线长（m）','length',3,'min="0.1" max="30"')}${field('中间打断次数','breaks',1,'min="0"')}${field('参考频点（GHz）','harness-frequency',2.5,'min="0.0001"')}</div><div class="two"><label>连接器品牌 / 系列<select id="connector"></select></label><label>参考线材筛选<select id="quality"><option value="all">全部公开参考</option><option value="STP">100Ω STP / 车载以太网</option><option value="Coax">50Ω 同轴</option></select></label></div><p id="connector-note" class="hint"></p><details><summary>对插假设与参考面</summary><div class="three">${field('实际对插界面数（空 = 2 + 断点）','interfaces','','min="0"')}${field('单个对插参考低值（dB）','connector-min',0,'min="0"')}${field('单个对插参考高值（dB）','connector-max',0.5,'min="0"')}</div><p class="warning">默认 0–0.5 dB 是通用敏感性假设，不能标为所选品牌的官方曲线；默认仅在不高于 3 GHz 的临近频段作参考。</p><label class="check"><input id="reference-confirmed" type="checkbox">已核对：选中 cable 预算与估算都覆盖完整线束，且两端接点只计一次</label></details><div id="harness-results"></div><h3>下发线束工程师的 VNA 验证需求</h3><pre id="vna-request"></pre><button id="export-harness" class="secondary">导出候选线束工程预估 · JSON</button></details>
<details class="optional"><summary><span class="step">04</span> 实测 S 参数比较 <small>本地 .s2p / .s4p</small></summary><p>仅比较实测频点。端口映射和参考面确认后才计算；不隐式重归一化。</p><label>本地 Touchstone 文件<input type="file" id="measurement-file" accept=".s2p,.s4p"></label><label>比较的规格项<select id="measurement-mask"></select></label><div class="four">${field('输入正端口','input-plus',1,'min="1" max="4"')}${field('输入负端口（4端口）','input-minus',3,'min="1" max="4"')}${field('输出正端口','output-plus',2,'min="1" max="4"')}${field('输出负端口（4端口）','output-minus',4,'min="1" max="4"')}</div><label class="check"><input type="checkbox" id="measurement-confirmed">已确认上述端口映射，且文件参考面与选中规格完全相同</label><button id="compare-measurement" class="secondary">比较实测频点</button><button id="export-measurement" class="quiet" disabled>导出实测比较 · JSON</button><div id="measurement-result" aria-live="polite"></div></details>
</main></div><footer>规格预算不代表链路通过。线束估算不代替供应商认可或 VNA 实测。<a href="https://github.com/wslycshhh/loss" target="_blank" rel="noreferrer">公共源码</a></footer>`;

function populateRules() {
  const previous = $('rule').value;
  const filtered = rules.filter(r => (r.direction === $('direction').value || r.direction === 'both') && r.vendor === $('vendor').value);
  $('rule').innerHTML = filtered.map(r => `<option value="${e(r.ruleId)}">${e(r.serializer)} → ${e(r.deserializer)} · ${e(r.rate.kind === 'frame' ? r.rate.frameBits + ' bit' : r.rate.lineRateGbps ? r.rate.lineRateGbps + ' Gbps' : 'TBD')} ${e(r.media.join('/'))} ${r.physicalLinkCounts.join('/')}链路 ${r.source.visibility==='restricted' ? e(Array.isArray(r.notes) ? r.notes[0] : '') : ''}</option>`).join('');
  if (filtered.some(r => r.ruleId === previous)) $('rule').value = previous;
  populateMode();
}
function populateVendors() {
  const previous = $('vendor').value;
  const vendors = [...new Set(rules.filter(r => r.direction === $('direction').value || r.direction === 'both').map(r => r.vendor))];
  $('vendor').innerHTML = vendors.map(v => `<option>${e(v)}</option>`).join('');
  if (vendors.includes(previous)) $('vendor').value = previous;
  populateRules();
}
function populateMode() {
  const rule = rules.find(r => r.ruleId === $('rule').value);
  if (!rule) return;
  const medium = $('media').value;
  $('media').innerHTML = rule.media.map(v => `<option value="${v}">${v === 'STP' ? '单对 STP · 100Ω' : '同轴 · 50Ω'}</option>`).join('');
  if (rule.media.includes(medium)) $('media').value = medium;
  $('physical').innerHTML = rule.physicalLinkCounts.map(n => `<option value="${n}">${n} 条高速物理通道</option>`).join('');
  $('measurement-mask').innerHTML = `<option value="">选择一个同参考面的限值</option>` + rule.lossMasks.map((m,i) => `<option value="${i}">${e(m.component)} · ${e(m.metric)} · ${e(m.referencePlane)}</option>`).join('');
  $('measurement-result').textContent = '';
  measurementReport=null;$('export-measurement').disabled=true;
  $('measurement-confirmed').checked = false;
  $('reference-confirmed').checked = false;
  $('additive-confirmed').checked = false;
  update();
}
function inputState() {
  const input = { direction:$('direction').value, media:$('media').value, serdesPhysicalLinkCount:Number($('physical').value), deserializerVideoOutputCount:Number($('video-outputs').value) };
  const fields = input.direction === 'camera'
    ? {width:'camera-width',height:'camera-height',fps:'camera-fps',rawBits:'raw-bits',csiLanes:'csi-lanes',csiLaneGbps:'csi-rate'}
    : {pclkMHz:'pclk',width:'width',height:'height',refreshHz:'refresh',blankingFactor:'blanking',hTotal:'htotal',vTotal:'vtotal',pixelsPerClock:'ppc',bitsPerPixel:'bpp'};
  for (const [name,id] of Object.entries(fields)) if ($(id).value !== '') input[name] = Number($(id).value);
  if (input.direction === 'display') input.pclkMode = $('pclk-mode').value;
  if(input.direction==='display'){
    if(input.pclkMode!=='spec')delete input.pclkMHz;
    if(input.pclkMode!=='estimate')delete input.blankingFactor;
    if(input.pclkMode!=='timing'){delete input.hTotal;delete input.vTotal;}
  }
  return input;
}
function update() {
  const rule = rules.find(r => r.ruleId === $('rule').value);
  if (!rule) return;
  $('display-inputs').hidden = $('direction').value !== 'display';
  $('camera-inputs').hidden = $('direction').value !== 'camera';
  $('spec-inputs').hidden = $('pclk-mode').value !== 'spec';
  $('estimate-inputs').hidden = $('pclk-mode').value !== 'estimate';
  $('timing-inputs').hidden = $('pclk-mode').value !== 'timing';
  const input = inputState();
  const result = calculateRate(input, rule);
  const pclkMinMHz=$('pclk-min').value===''?null:Number($('pclk-min').value);
  const pclkMaxMHz=$('pclk-max').value===''?null:Number($('pclk-max').value);
  const useSpecBounds=input.direction==='display'&&input.pclkMode==='spec';
  const worstCase=useSpecBounds&&pclkMaxMHz!==null?calculateRate({...input,pclkMHz:pclkMaxMHz},rule):null;
  if(useSpecBounds&&((pclkMinMHz!==null&&(!(pclkMinMHz>0)||pclkMinMHz>input.pclkMHz))||(pclkMaxMHz!==null&&(!(pclkMaxMHz>0)||pclkMaxMHz<input.pclkMHz)))){result.status='Unsupported';result.warnings.push('规格书时钟应满足 0 < Min ≤ Typ ≤ Max。');}
  if(worstCase?.status==='Unsupported'){result.status='Unsupported';result.warnings.push('规格书 Max PCLK 超出当前模式能力；最不利点仅供诊断。');}
  const fGHz = $('frequency').value === '' ? (worstCase?.nyquistGHz ?? result.nyquistGHz) : Number($('frequency').value);
  const rows = rule.lossMasks.filter(m => (input.media === 'STP' ? m.metric.startsWith('Sdd') : !m.metric.startsWith('Sdd'))).map(mask => ({ mask, value:evaluateMask(mask,fGHz) }));
  const budgetCheck=compareInsertionBudget(rows.map(v=>v.mask),fGHz,$('additive-confirmed').checked);
  currentReport = { reportType:'SI_SPECIFICATION_BUDGET', generatedAt:new Date().toISOString(), verdict:'规格预算；未证明链路通过', releaseState:result.status!=='OK'||rule.verificationStatus!=='verified_public'||rows.some(v=>v.value.status!=='OK')||!rows.length?'DRAFT_REQUIRES_REVIEW':'SPECIFICATION_BUDGET_ONLY',input, pclkSource:input.direction==='camera'?'camera_spec':input.pclkMode === 'spec' ? $('pclk-source').value : input.pclkMode==='timing'?'exact_timing':'estimated', result, pclkBounds:useSpecBounds?{pclkMinMHz,pclkMaxMHz,worstCase}:null,budgetCheck,frequencyGHz:fGHz, rule:{ruleId:rule.ruleId,verificationStatus:rule.verificationStatus,source:rule.source,notes:rule.notes}, importMeta:importedSources.get(rule.ruleId)??null, limits:rows.map(({mask,value})=>({component:mask.component,metric:mask.metric,comparison:mask.comparison,referencePlane:mask.referencePlane,referenceOhms:mask.referenceOhms,verificationStatus:mask.verificationStatus,frequencyGHz:fGHz,...value,source:mask.source ?? rule.source})) };
  $('budget-result').innerHTML=$('additive-confirmed').checked?`<p class="hint">组件 IL 之和 ${fmt(budgetCheck.componentSumDb)} dB · 总预算 ${fmt(budgetCheck.totalAllowanceDb)} dB · 差值 ${fmt(budgetCheck.differenceDb)} dB。${e(budgetCheck.reason)}</p>`:'';
  currentReport.frequencyMasks=rule.lossMasks;
  currentReport.measurementRequirements={fileType:input.media==='STP'?'.s4p':'.s2p',referenceOhms:input.media==='STP'?100:50,referencePlanes:[...new Set(rule.lossMasks.map(m=>m.referencePlane))],frequencyBandsGHz:rule.lossMasks.flatMap(m=>m.segments.map(s=>s.rangeGHz)),environment:'供应商须提交常温及适用全温/老化/弯折/断点场景；实际条件以源规范为准',measurement:'校准 VNA，明确夹具与去嵌参考面、端口映射、频点分辨率及量测不确定度'};
  $('result-state').textContent = result.status === 'Unsupported' ? '输入 / 组合超出适用范围' : result.status === 'TBD' ? 'TBD · 待确认' : statusText[rule.verificationStatus];
  $('result-state').className = 'state ' + (result.status === 'Unsupported' ? 'bad' : rule.source.visibility === 'restricted' ? 'restricted' : '');
  const metrics = [ ['每通道物理线速',result.lineRateGbpsPerLink,'Gbps'], ['总物理线速',result.totalLineRateGbps,'Gbps'], ['符号率 / 每通道',result.symbolRateGBd,'GBd'], ['Nyquist / 每通道',result.nyquistGHz,'GHz'] ];
  $('rate-results').innerHTML = `<div class="metrics">${metrics.map(([label,value,unit])=>`<div><span>${label}</span><strong>${fmt(value)} <small>${unit}</small></strong></div>`).join('')}</div><div class="rate-detail"><span>有效画面净载荷 <b>${fmt(result.videoPayloadGbps)} Gbps</b></span><span>PCLK 口径视频数据率 <b>${fmt(result.clockedVideoGbps)} Gbps</b></span><span>当前 PCLK <b>${fmt(result.pclkMHz)} MHz</b></span><span>等效像素率 <b>${fmt(result.equivalentPixelMHz)} Mpixel/s</b></span>${result.csiCapacityGbps !== null ? `<span>CSI 传输能力 <b>${fmt(result.csiCapacityGbps)} Gbps</b></span>` : ''}</div>`;
  const notices = [...result.warnings, ...(worstCase?[`已按 Max PCLK ${fmt(pclkMaxMHz)} MHz 计算最不利点：每通道 ${fmt(worstCase.lineRateGbpsPerLink)} Gbps，Nyquist ${fmt(worstCase.nyquistGHz)} GHz；自动查询频点采用此值。`]:[]),...(rule.source.visibility === 'restricted' ? ['内部授权参数已加载。限值抄录仍待人工/厂家复核；导出报告仅供内部使用。'] : []), ...(rule.verificationStatus === 'demo' ? ['合成数学演示，所有物理模式均非厂商规格。'] : []), ...(result.status === 'Unsupported' ? ['数值仅用于诊断；当前输入不能作为可下发的正式规格。'] : [])];
  $('warnings').innerHTML = notices.length ? `<div class="warning-list">${notices.map(v=>`<p>${e(warningText(v))}</p>`).join('')}</div>` : '';
  $('mask-results').innerHTML = rows.length ? `<div class="table-scroll"><table><thead><tr><th>组件 / 指标</th><th>signed 限值</th><th>正值损耗</th><th>参考面 / 阻抗</th><th>依据状态</th></tr></thead><tbody>${rows.map(({mask,value})=>`<tr><td>${e(mask.component)}<small>${e(mask.metric)} @ ${fmt(fGHz)} GHz</small></td><td>${mask.comparison === 'min' ? '≥' : '≤'} ${fmt(value.signedDb)} dB</td><td>${mask.comparison === 'min' ? 'IL ≤' : 'RL ≥'} ${fmt(value.positiveLossDb)} dB</td><td>${e(mask.referencePlane)}<small>${e(mask.referenceOhms)} Ω</small></td><td>${e(statusText[mask.verificationStatus])}${value.warning ? `<small>${e(value.warning)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">TBD · 此模式暂无已加载的 IL / RL 数值。缺少内部授权参数时不会提供默认限值。</p>`;
  $('source').innerHTML = `<p class="hint">${sourceLink(rule.source)} · ${e(rule.source.revision)} · ${e(rule.source.section)} · 核查 ${e(rule.source.checkedAt)}</p>${(Array.isArray(rule.notes) ? rule.notes : [rule.notes]).filter(Boolean).map(note=>`<p class="hint">${e(note)}</p>`).join('')}`;
  drawChart(rows.map(v=>v.mask));
  updateHarness();
}
function drawChart(masks) {
  const metric = $('chart-metric').value;
  masks = masks.filter(m => metric === 'IL' ? m.metric.endsWith('21') : m.metric.endsWith('11'));
  if (!masks.length) { $('chart').innerHTML = ''; return; }
  const maxF = Math.max(...masks.flatMap(m=>m.segments.map(s=>s.rangeGHz[1])));
  const series = masks.map(mask=>({mask,segments:mask.segments.map(s=>Array.from({length:51},(_,i)=>{const x=s.rangeGHz[0]+(s.rangeGHz[1]-s.rangeGHz[0])*i/50; return [x,evaluateMask(mask,x).positiveLossDb];}))}));
  const maxY = Math.max(1,...series.flatMap(s=>s.segments.flatMap(a=>a.map(p=>p[1]??0))))*1.12;
  const colors = ['#087f8c','#5665ad','#b27324','#5f767d'];
  $('chart').innerHTML = `<svg viewBox="0 0 800 230" role="img" aria-label="${metric} 规格限值曲线，缺失频段不连接"><path d="M48 15V195H770" stroke="#99a7b3" fill="none"/>${[0,0.5,1].map(t=>`<text x="8" y="${198-t*180}">${fmt(t*maxY,1)}</text><text x="${45+t*720}" y="220">${fmt(t*maxF,2)}</text>`).join('')}${series.map((s,i)=>s.segments.map(points=>`<polyline points="${points.filter(p=>p[1]!==null).map(([x,y])=>`${48+x/maxF*720},${195-y/maxY*180}`).join(' ')}" stroke="${colors[i%colors.length]}" stroke-width="2" fill="none"/>`).join('')).join('')}<text x="735" y="238">GHz</text></svg><div class="legend">${series.map((s,i)=>`<span style="color:${colors[i%colors.length]}">${e(s.mask.component)} · ${e(s.mask.metric)}</span>`).join('')}</div>`;
}
function updateHarness() {
  if (!currentReport) return;
  try {
    const connector = connectors.find(c=>c.id === $('connector').value);
    const medium = currentReport.input.media;
    $('connector-note').textContent = connector ? `${connector.name}：${connector.notes} 所示估算独立采用通用对插假设，不是该品牌官方 IL。` : '仅采用通用对插假设；需要线束供应商提供实际 GHz 级曲线。';
    const freq = Number($('harness-frequency').value);
    const maskRow = rules.find(r=>r.ruleId === $('rule').value)?.lossMasks.find(m=>m.component === 'cable' && m.metric.endsWith('21') && (medium === 'STP' ? m.metric.startsWith('Sdd') : !m.metric.startsWith('Sdd')));
    const budget = maskRow ? evaluateMask(maskRow,freq) : null;
    const mismatch = connector && connector.medium !== medium;
    const settings = { fGHz:freq,lengthM:Number($('length').value),inlineBreakCount:Number($('breaks').value),connectorMinDb:Number($('connector-min').value),connectorMaxDb:Number($('connector-max').value),connectorMaxGHz:3,allowanceDb:budget?.positiveLossDb ?? null,referencePlaneConfirmed:$('reference-confirmed').checked && !mismatch };
    if ($('interfaces').value !== '') settings.interfaceCount = Number($('interfaces').value);
    const subset = cables.filter(c=>$('quality').value === 'all' || c.medium === $('quality').value);
    const candidates = subset.map(cable=>({ ...estimateHarness(cable,{...settings,referencePlaneConfirmed:settings.referencePlaneConfirmed&&cable.medium===medium}), compatibleMedium:cable.medium === medium }));
    harnessReport = {reportType:'HARNESS_REFERENCE_ONLY',generatedAt:new Date().toISOString(),settings,connector:connector?.name,connectorEvidence:'generic_assumption',budgetVerificationStatus:maskRow?.verificationStatus ?? 'TBD',budgetReferencePlane:maskRow?.referencePlane ?? 'TBD',notAnApproval:true,candidates};
    const request=`链路：${currentReport.rule.ruleId}\n每物理通道线速：${fmt(currentReport.result.lineRateGbpsPerLink)} Gbps；Nyquist：${fmt(currentReport.result.nyquistGHz)} GHz\n介质：${medium}，${currentReport.measurementRequirements.referenceOhms} Ω；总长 ${settings.lengthM} m，中间断点 ${settings.inlineBreakCount}，对插界面 ${settings.interfaceCount??2+settings.inlineBreakCount}\n连接器：${connector?.name??'未知'}\n线束参考面：${maskRow?.referencePlane??'TBD，须按供应商规范确认'}\n扫频范围：${currentReport.measurementRequirements.frequencyBandsGHz.length?currentReport.measurementRequirements.frequencyBandsGHz.map(b=>b.map(v=>fmt(v)).join('–')+' GHz').filter((v,i,a)=>a.indexOf(v)===i).join('；'):'TBD，不得用未知范围编造掩码'}\n请按所附 SI 规格报告中的线束/全通道 IL、RL 掩码分别提交 signed S 参数，不相加回损。\n${currentReport.measurementRequirements.environment}\n${currentReport.measurementRequirements.measurement}\n提交 ${currentReport.measurementRequirements.fileType} 原始数据与测量报告。TBD / 待复核规则先取得确认，当前工具未给出链路通过结论。`;
    $('vna-request').textContent=request;harnessReport.validationRequest=request;
    $('harness-results').innerHTML = `${mismatch ? '<p class="warning">所选连接器与当前介质不匹配，禁止做预算裕量判断。</p>' : ''}<p class="hint">参考预算：${fmt(settings.allowanceDb)} dB · ${e(statusText[maskRow?.verificationStatus] ?? 'TBD')}。跨介质样本只作行业参考，不能用于当前链路。</p><div class="table-scroll"><table><thead><tr><th>真实线材样本</th><th>裸线 / 含对插参考</th><th>保守参考裕量</th><th>证据 / 风险</th></tr></thead><tbody>${candidates.map(c=>`<tr><td>${e(c.cable.name)}<small>${e(c.cable.medium)} · ${e(c.cable.region)} ${c.compatibleMedium ? '' : '· 与当前介质不匹配'}</small></td><td>${fmt(c.bareCableDb)} dB<small>${fmt(c.minDb)} – ${fmt(c.maxDb)} dB</small></td><td>${c.compatibleMedium ? fmt(c.marginDb) : 'NA'} dB</td><td>${e(c.cable.evidence === 'nominal' ? '典型值' : c.cable.evidence === 'upper_limit' ? '厂商限值点内插' : '缺少曲线')}<small>${e(c.compatibleMedium ? c.risk ?? c.reason : '仅行业参考，不比较预算')}</small>${sourceLink(c.cable.source)}</td></tr>`).join('')}</tbody></table></div><p class="warning">回损不估算汇总值，实际线束 RL 待 VNA 验证。未考虑温度、弯折、老化、压接、PoC 与阻抗不连续；不同证据类型不能当作同条件排名。</p>`;
  } catch (error) { harnessReport = null; $('harness-results').innerHTML = `<p class="error">${e(error.message)}</p>`; }
}

function download(name, text, type='application/json') {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const json=value=>JSON.stringify(value,(_key,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v,2);
$('settings').addEventListener('submit',event=>event.preventDefault());
$('settings').addEventListener('input',event=>{ if (!['vendor','rule','direction'].includes(event.target.id)) update(); });
$('direction').addEventListener('change',populateVendors);
$('vendor').addEventListener('change',populateRules);
$('rule').addEventListener('change',populateMode);
for (const id of ['frequency','chart-metric','additive-confirmed']) $(id).addEventListener('input',update);
$('harness-panel').addEventListener('input',updateHarness);
$('print').addEventListener('click',()=>window.print());
$('export-si').addEventListener('click',()=>download('loss-si-requirements.json',json(currentReport)));
$('export-harness').addEventListener('click',()=>{ if(harnessReport) download('loss-harness-reference.json',json(harnessReport)); });
$('export-measurement').addEventListener('click',()=>{if(measurementReport)download('loss-measured-points.json',json(measurementReport));});
$('export-csv').addEventListener('click',()=>{
  const cell = v => '"' + String(typeof v === 'string' && /^\s*[=+\-@]/.test(v) ? "'"+v : v ?? '').replaceAll('"','""') + '"';
  const rows = [['component','metric','frequencyGHz','signedDb','comparison','referencePlane','referenceOhms','verificationStatus'], ...currentReport.limits.map(m=>[m.component,m.metric,m.frequencyGHz,m.signedDb,m.comparison,m.referencePlane,m.referenceOhms,m.verificationStatus])];
  download('loss-si-limits.csv','\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
});
$('rule-file').addEventListener('change',async event=>{
  const file = event.target.files[0]; if(!file)return;
  try {
    const text = await file.text();
    const pack = importRules(JSON.parse(text),rules);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
    rules = [...rules,...pack.rules];
    for(const rule of pack.rules)importedSources.set(rule.ruleId,{packId:pack.packId,sha256:hash});
    populateVendors(); $('vendor').value = pack.rules[0].vendor; populateRules();
    $('import-status').textContent = `已导入 ${pack.rules.length} 个模式。SHA-256 ${hash.slice(0,12)}… · 仅内存使用；内部抄录限值仍待复核。请人工选择实际帧模式和掩码档位。`;
  } catch(error) { $('import-status').textContent = `导入失败，保留原规则与计算状态：${error.message}`; }
  event.target.value='';
});
$('clear-import').addEventListener('click',()=>{ rules=[...publicRules,...demos];importedSources.clear();populateVendors();$('import-status').textContent='本地导入已清除，当前仅使用公共规则。'; });
$('measurement-file').addEventListener('change',async event=>{
  measurementReport=null;$('export-measurement').disabled=true;
  const file=event.target.files[0]; if(!file)return;
  try { const parsed=parseTouchstone(await file.text(),file.name.toLowerCase().endsWith('.s4p')?4:2); measurement=parsed; $('measurement-confirmed').checked=false;$('measurement-result').textContent=`已在内存读取 ${parsed.points.length} 个频点、${parsed.portCount} 端口、${parsed.referenceOhms} Ω。请确认映射与参考面。`; }
  catch(error){measurement=null;$('measurement-result').textContent=`文件解析失败：${error.message}`;}
});
$('compare-measurement').addEventListener('click',()=>{
  measurementReport=null;$('export-measurement').disabled=true;
  try {
    if(!measurement)throw new Error('请先选择有效 Touchstone 文件。');
    if($('measurement-mask').value==='')throw new Error('请先选择规格项。');
    const mask=rules.find(r=>r.ruleId===$('rule').value).lossMasks[Number($('measurement-mask').value)];
    const derived=deriveMetrics(measurement,{inputPlus:Number($('input-plus').value),inputMinus:Number($('input-minus').value),outputPlus:Number($('output-plus').value),outputMinus:Number($('output-minus').value),mappingConfirmed:$('measurement-confirmed').checked,referencePlane:mask.referencePlane});
    const result=compareMeasurement(derived,mask,evaluateMask);
    measurementReport={reportType:'MEASURED_SOURCE_POINTS_ONLY',generatedAt:new Date().toISOString(),rule:currentReport.rule,mask,result,mapping:{inputPlus:Number($('input-plus').value),inputMinus:Number($('input-minus').value),outputPlus:Number($('output-plus').value),outputMinus:Number($('output-minus').value)},referencePlane:derived.referencePlane,referenceOhms:derived.referenceOhms};$('export-measurement').disabled=false;
    $('measurement-result').innerHTML=`<p class="notice">${e(result.status)} · 最差实测点裕量 ${fmt(result.worstMarginDb)} dB</p><p>${e(result.reason??'')} ${e(result.warning ?? '')}</p><div class="table-scroll"><table><thead><tr><th>频率 GHz</th><th>实测 signed dB</th><th>限值 dB</th><th>裕量 dB</th></tr></thead><tbody>${result.points.slice(0,100).map(p=>`<tr><td>${fmt(p.fGHz)}</td><td>${fmt(p.measuredDb)}</td><td>${fmt(p.maskDb)}</td><td>${fmt(p.marginDb)}</td></tr>`).join('')}</tbody></table></div><p class="hint">页面最多显示前 100 点；汇总按全文件所有实测频点计算，不证明未测频点或整条链路合格。</p>`;
  }catch(error){$('measurement-result').textContent=`比较未完成：${error.message}`;}
});
for(const id of ['measurement-mask','input-plus','input-minus','output-plus','output-minus','measurement-confirmed'])$(id).addEventListener('input',()=>{measurementReport=null;$('export-measurement').disabled=true;$('measurement-result').textContent='比较条件已改变，请确认映射和参考面后重新比较。';});
$('connector').innerHTML=connectors.map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join('');
populateVendors();
