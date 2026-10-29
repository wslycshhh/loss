// Public facts only. Frequencies are GHz; cable attenuation is positive dB/m.
// sqrt-linear masks use a*sqrt(fGHz) + b*fGHz + c, with signed S-parameter dB.
const checkedAt = '2026-10-29';
const ti947 = {
  title: 'TI DS90UB947-Q1 datasheet',
  url: 'https://www.ti.com/lit/ds/symlink/ds90ub947-q1.pdf',
  revision: 'SNLS454A, March 2019',
  section: '7.1, 7.3.1, 7.4.2.1-7.4.2.2 (pp.14-15,33)',
  checkedAt, visibility: 'public',
};
const gmsl2 = {
  title: 'ADI GMSL2 Channel Specification User Guide',
  url: 'https://www.analog.com/media/en/technical-documentation/user-guides/gmsl2-channel-specification-user-guide.pdf',
  revision: 'Rev 1, October 2023',
  section: 'pp.4-10,17-21; Eq.2-4,7-12',
  checkedAt, visibility: 'public',
};
const connectorGuide = {
  title: 'ADI Public GMSL2 Hardware Design and Validation Guide',
  url: 'https://www.analog.com/media/en/technical-documentation/user-guides/public-gmsl2-hardware-design-and-validation-guide.pdf',
  revision: 'UG-2212 Rev 3, August 2025',
  section: 'p.19, Connectors; p.20, Table 3',
  checkedAt, visibility: 'public',
};
const sqrt1000 = Math.sqrt(1000);
const segment = (lo, hi, sqrtCoefficient, linear, constant) => ({
  rangeGHz: [lo, hi], model: 'sqrt-linear',
  coefficients: [sqrtCoefficient, linear, constant],
});
const returnLoss = [
  segment(0.002, 0.01, 0, -900, -6),
  segment(0.01, 0.2, -0.28 * sqrt1000, -0.8, -14.2),
  segment(0.2, 0.4, 0, 20, -22.3),
  segment(0.4, 1.5, 0, 5.7, -16.6),
  segment(1.5, 3.5, 0, 0, -8),
];

export const publicRules = [
  ...[1, 2].map(links => ({
    ruleId: `ti-947-948-${links}link`, vendor: 'Texas Instruments',
    serializer: 'DS90UB947-Q1', deserializer: 'DS90UB948-Q1',
    direction: 'display', media: ['STP', 'Coax'], physicalLinkCounts: [links],
    verificationStatus: 'verified_public', source: ti947,
    rate: {
      kind: 'frame', frameBits: 35, modulation: 'NRZ',
      allowEvenSplit: links === 2, pixelsPerClockSupported: [1],
      pclkMinMHz: links === 1 ? 25 : 50,
      pclkMaxMHz: links === 1 ? 96 : 170,
    },
    lossMasks: [],
    notes: [
      links === 1
        ? '单条物理链路：每链路速率=PCLK×35；不得因Coax/STP介质再乘0.5。'
        : '两条物理链路、接收端支持dual-link且已配置交替像素：每链路速率=PCLK×35/2。Replicate重复画面模式不适用。',
      'PCLK按总像素时序等效像素率输入；OpenLDI接口时钟与双像素映射须结合实际配置核对。这里不支持把2 pixels/clock再乘入。',
      '未取得本组合连续频段IL/RL mask，线损判定为unavailable；接收器AEQ离散点不外推为mask。',
    ],
  })),
  ...[['AIM955', 'AIM956'], ['AIM957', 'AIM958']].map(([serializer, deserializer]) => ({
    ruleId: `aim-ahdl2-${serializer.toLowerCase()}-${deserializer.toLowerCase()}-tbd`,
    vendor: '慷智 AIM', serializer, deserializer,
    direction: 'display', media: ['STP', 'Coax'], physicalLinkCounts: [1, 2],
    verificationStatus: 'unavailable',
    source: {
      title: '慷智 AIM955/957 AHDL-II产品简介',
      url: 'https://www.aimicron.com/product/18',
      revision: '官网未标版本；2026-10-29搜索缓存核对',
      section: '产品简介；本次直接访问HTTP 502，官方搜索缓存可见',
      checkedAt, visibility: 'public',
    },
    rate: { kind: 'unavailable', modulation: 'unknown', allowEvenSplit: false },
    lossMasks: [],
    notes: [
      '公开产品族简介称单AHDL-II通道最高150MHz、双通道最高300MHz，支持同轴或双绞线；能力简介不构成具体器件组合模式核验。',
      '配套接收产品族官方入口：https://www.aimicron.com/product/19；本次直接访问502，同官网HUD/74搜索缓存可见AIM956/958简介。',
      '本条仅为待核验组合入口；未采用非公开资料，frame bits、固定线速、调制、均分条件及IL/RL mask均TBD。',
    ],
  })),
  {
    ruleId: 'ti-ds90ub933-camera-tbd', vendor: 'Texas Instruments',
    serializer: 'DS90UB933-Q1', deserializer: '待指定（公开示意934/964）',
    direction: 'camera', media: ['STP', 'Coax'], physicalLinkCounts: [1],
    verificationStatus: 'unavailable',
    source: {
      title: 'TI DS90UB933-Q1 datasheet',
      url: 'https://www.ti.com/lit/ds/symlink/ds90ub933-q1.pdf',
      revision: 'SNLS546E, November 2020', section: 'p.1功能及示意图；p.6 §6.3',
      checkedAt, visibility: 'public',
    },
    rate: { kind: 'unavailable', modulation: 'unknown', allowEvenSplit: false },
    lossMasks: [],
    notes: [
      '公开资料确认摄像头并行输入10/12bit及单Coax/差分线对；10bit模式PCLK 50–100MHz，12bit模式37.5–100MHz。',
      '这些是输入能力范围，不是实际传感器PCLK，也不是物理线速。具体接收器、模式、封装开销及连续IL/RL mask未在本条核验，保持TBD。',
      '此并行输入FPD-Link III器件不因工具存在CSI输出字段就成为MIPI CSI串行器。',
    ],
  },
  ...[3, 6].flatMap(speed => ['Coax', 'STP'].map(medium => {
    const il = medium === 'Coax' ? 'S21' : 'Sdd21';
    const rl = medium === 'Coax' ? 'S11' : 'Sdd11';
    const referenceOhms = medium === 'Coax' ? 50 : 100;
    const total = speed === 3 ? [
      segment(0.002, 0.005, -0.27 * sqrt1000, -2.2, -7.7),
      segment(0.005, 2, -0.27 * sqrt1000, -2.2, -5.7),
    ] : [
      segment(0.002, 0.5, -0.25 * sqrt1000, -0.64, -3.2),
      segment(0.5, 3.5, -0.25 * sqrt1000, -1.56, -2.74),
    ];
    const cable = speed === 3
      ? [segment(0.002, 2, -0.27 * sqrt1000, -2.2, -1.7)]
      : [segment(0.002, 3.5, -0.25 * sqrt1000, -0.64, -1.5)];
    const pcb = speed === 3 ? [
      segment(0.002, 0.005, 0, 0, -3), segment(0.005, 2, 0, 0, -2),
    ] : [
      segment(0.002, 0.5, 0, 0, -0.85), segment(0.5, 3.5, 0, -0.46, -0.62),
    ];
    const planes = {
      total: 'Serializer SIO pin(s) to deserializer SIO pin(s)',
      cable: 'Cable-side connector to cable-side connector, including in-line connectors',
      pcb_tx: 'Serializer SIO pin(s) to end of PCB-mounted connector',
      pcb_rx: 'Deserializer SIO pin(s) to end of PCB-mounted connector',
    };
    return {
      ruleId: `adi-gmsl2-family-${speed}g-${medium.toLowerCase()}`,
      vendor: 'Analog Devices', serializer: 'GMSL2协议族（型号待指定）',
      deserializer: 'GMSL2协议族（型号待指定）',
      direction: 'both', media: [medium], physicalLinkCounts: [1],
      verificationStatus: 'verified_public', source: gmsl2,
      rate: { kind: 'fixed', lineRateGbps: speed, modulation: 'NRZ', allowEvenSplit: false },
      lossMasks: ['total', 'cable', 'pcb_tx', 'pcb_rx'].flatMap(component => [
        {
          component, metric: il, comparison: 'min', referenceOhms,
          referencePlane: planes[component], verificationStatus: 'verified_public',
          segments: component === 'total' ? total : component === 'cable' ? cable : pcb,
          source: { ...gmsl2, section: component === 'total' ? 'p.9, Eq.2-3' : 'p.19, Eq.7-10' },
        },
        {
          component, metric: rl, comparison: 'max', referenceOhms,
          referencePlane: planes[component], verificationStatus: 'verified_public',
          segments: returnLoss,
          source: { ...gmsl2, section: component === 'total' ? 'p.10, Eq.4' : 'pp.20-21, Eq.11-12' },
        },
      ]),
      notes: [
        '仅已核验公开GMSL2协议族通道规范；具体串/解串器组合及该固定模式支持状态为unavailable，须再核验器件数据表。',
        '3/6 Gbps为每条物理链路固定速率，独立于画面载荷；多链路必须分别核算，不自动均分固定速率。',
        'S参数mask为有符号dB：IL须高于下限，RL须低于上限；共享分段边界采用较严格一侧。',
        'RL不可相加；PCB连接器属于PCB模块，线缆模块含线端连接器与中间对插，不得重复计损。',
        '曲线与线束估算不等于整链路认证；完整规范还包括串扰、最坏温度/老化条件及link margin。',
      ],
    };
  })),
];

export const cables = [
  {
    id: 'leoni-dacar302', name: 'LEONI Dacar 302 / 85120380D',
    region: '国际厂商（LEONI）', medium: 'Coax', referenceOhms: 50,
    evidence: 'nominal',
    points: [
      { fGHz: 0.2, dbPerM: 0.211 }, { fGHz: 0.5, dbPerM: 0.303 },
      { fGHz: 0.8, dbPerM: 0.437 }, { fGHz: 1, dbPerM: 0.489 },
      { fGHz: 1.2, dbPerM: 0.536 }, { fGHz: 1.5, dbPerM: 0.605 },
      { fGHz: 1.8, dbPerM: 0.663 }, { fGHz: 2, dbPerM: 0.705 },
      { fGHz: 2.2, dbPerM: 0.74 }, { fGHz: 2.8, dbPerM: 0.844 },
      { fGHz: 3, dbPerM: 0.881 }, { fGHz: 3.5, dbPerM: 0.966 },
      { fGHz: 4, dbPerM: 1.042 }, { fGHz: 4.5, dbPerM: 1.123 },
      { fGHz: 5, dbPerM: 1.204 }, { fGHz: 5.5, dbPerM: 1.278 },
      { fGHz: 5.6, dbPerM: 1.293 }, { fGHz: 6, dbPerM: 1.349 },
    ],
    source: {
      title: 'LEONI Automotive Cables catalogue',
      url: 'https://d6ps5s74stj59.cloudfront.net/fileadmin/acs/files/publications/product_information/leoni_automotive_cable_solutions_en.pdf',
      revision: 'February 2019', section: 'pp.80-81, Dacar 302 row (PDF pages 80-81)',
      checkedAt, visibility: 'public',
    },
    notes: '原表dB/100m除以100；历史目录参考值按nominal录入，未标衰减测量温度/公差，不作当前供货保证。仅范围内线性插值，不外推。',
  },
  {
    id: 'tition-50ohm-26awg', name: '天信 50Ω 26AWG低损耗车辆射频同轴线',
    region: '国产（中国嘉兴）', medium: 'Coax', referenceOhms: 50,
    evidence: 'nominal', temperatureC: 20,
    points: [
      { fGHz: 0.1, dbPerM: 0.252 }, { fGHz: 0.2, dbPerM: 0.352 },
      { fGHz: 0.5, dbPerM: 0.583 }, { fGHz: 0.75, dbPerM: 0.733 },
      { fGHz: 0.8, dbPerM: 0.761 }, { fGHz: 1, dbPerM: 0.867 },
      { fGHz: 1.2, dbPerM: 0.966 }, { fGHz: 1.5, dbPerM: 1.101 },
      { fGHz: 1.8, dbPerM: 1.232 }, { fGHz: 2, dbPerM: 1.32 },
      { fGHz: 2.2, dbPerM: 1.402 }, { fGHz: 2.25, dbPerM: 1.424 },
      { fGHz: 2.5, dbPerM: 1.525 }, { fGHz: 2.8, dbPerM: 1.653 },
    ],
    source: {
      title: '嘉兴市天信电线：低损耗车辆用射频同轴电缆',
      url: 'https://www.tition.com/products_72/598.html',
      revision: '网页上架2023-08-25', section: '产品特性、产品参数 / 20℃衰减 dB/100m nom.',
      checkedAt, visibility: 'public',
    },
    notes: '原表20℃典型dB/100m除以100；50±3Ω、26AWG、外径2.8±0.1mm。并非全温上限，仅范围内线性插值，不外推。',
  },
  {
    id: 'caleb-stp-10gbase-t1', name: 'Caleb STP 10GBase-T1 Ethernet Cable',
    region: '公开厂商样本（产地待确认）', medium: 'STP', referenceOhms: 100,
    evidence: 'upper_limit',
    points: [
      { fGHz: 0.005, dbPerM: 0.13 }, { fGHz: 0.1, dbPerM: 0.29 },
      { fGHz: 1, dbPerM: 1 }, { fGHz: 3, dbPerM: 2 }, { fGHz: 5.5, dbPerM: 3 },
    ],
    source: {
      title: 'Caleb STP 10GBase-T1 Ethernet Cable datasheet',
      url: 'https://www.calebcable.com/Upload/STP%2010GBase-T1%20Ethernet%20Cable-4.pdf',
      revision: '未标版本日期；2026-10-29公开版', section: 'p.1, Transmission Performance / Insertion Loss',
      checkedAt, visibility: 'public',
    },
    notes: '100±5Ω；原表为Limit(dB/m)，不是典型值，也未标测量温度。两limit点之间线性插值只是估算，并非厂商连续频段保证；不是GMSL认证。',
  },
];

export const connectors = [
  ...['Coax', 'STP'].map(medium => ({
    id: `generic-connector-${medium.toLowerCase()}`, name: `通用${medium}连接器插损假设（非品牌认证）`,
    medium, referenceOhms: medium === 'Coax' ? 50 : 100,
    evidence: 'generic_assumption', minDb: 0, maxDb: 0.5, maxGHz: 3,
    source: connectorGuide,
    notes: 'ADI只称连接器插损通常<0.5dB@3GHz；0~0.5dB及向较低频率使用均为工具预算假设，非每处实际对插保证。对插计数/参考面须按具体模型核对；超过3GHz不可用。',
  })),
  {
    id: 'rosenberger-hmtd-tbd', name: 'Rosenberger H-MTD（具体料号IL待确认）',
    medium: 'STP', referenceOhms: 100, evidence: 'unavailable', maxGHz: 20,
    source: {
      title: 'Rosenberger H-MTD Connector Systems catalogue',
      url: 'https://www.rosenberger.com/fileadmin/content/headquarter/Downloads/Differential_Data_Connectors/H-MTD_Catalog_2024.pdf',
      revision: '2024 catalogue', section: 'pp.12-13, H-MTD Code E6 Technical Data',
      checkedAt, visibility: 'public',
    },
    notes: '公开目录给100Ω、随线材类型的0.01~20GHz频段及RL，但本系列表未列可采用的IL。20GHz不是本工具IL可用范围；具体料号、线端/板端与配对模型TBD。',
  },
  {
    id: 'xinhan-stp-tbd', name: '信瀚 STP连接器（品牌/料号/数据TBD）',
    medium: 'STP', referenceOhms: 100, evidence: 'unavailable',
    source: { ...connectorGuide, section: 'pp.19-20仅通用参考；不包含信瀚料号或性能证据' },
    notes: '100Ω只是STP设计参考阻抗，非已核验厂商参数；未确定公开官方型号及IL/RL资料，不假定与同音厂商相同，不套用其他品牌数据。',
  },
];
