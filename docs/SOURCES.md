# 公开数据来源与适用范围

核验日期：2026-10-29。此目录只含公开网页/PDF的少量事实、数值和出处，不随代码分发原始厂商PDF。所有频率统一GHz，线材衰减为正值dB/m，S参数mask保留有符号dB。供应商若更新资料，应按精确型号和版本重新核验。

| 数据 | 公开原始来源 | 已采用与边界 |
| --- | --- | --- |
| DS90UB947-Q1 / DS90UB948-Q1 | [TI 947 SNLS454A](https://www.ti.com/lit/ds/symlink/ds90ub947-q1.pdf)，2019-03，§7.1/7.3.1/7.4.2.1–2 | 35bit串行符号；单物理链路PCLK 25–96MHz；双物理链路50–170MHz，交替像素且各链路半速。单Coax/STP不再乘0.5。仅录等效像素率、1 pixel/clock；实际OpenLDI双像素时钟须先换算，Replicate不能均分。 |
| 948接收端参考 | [TI 948 SNLS477D](https://www.ti.com/lit/ds/symlink/ds90ub948-q1.pdf)，2022-02，首页/§7.3.12.1表7-6 | 确认947配对与50Ω Coax/100Ω STP。表内线速与Nyquist半速对应。AEQ只给几个离散参考点，不能据此生成连续IL/RL mask；此组合的mask留空。948的192MHz能力不扩大947的170MHz组合上限。 |
| 慷智AHDL-II待确认组合 | [AIM955/957官方产品简介](https://www.aimicron.com/product/18)、[AIM956/958官方入口](https://www.aimicron.com/product/19)、[同官网接收器简介](https://www.aimicron.com/HUD/74)，未标版本 | 本次直接访问/18及/19返回HTTP502；官方搜索缓存可见/18及HUD/74的简介。仅确认产品族提供LVDS与单/双AHDL-II通道转换、同轴或双绞线、单/双通道最高PCLK能力简介150/300MHz。AIM955→956、957→958只列为待核验选择入口，具体工作模式、线速/调制/开销、均分条件和mask均unavailable。 |
| TI933摄像头待确认入口 | [TI 933 SNLS546E](https://www.ti.com/lit/ds/symlink/ds90ub933-q1.pdf)，2020-11，pp.1/6 | 公开并行输入10/12bit与单Coax/差分链路；10bit输入PCLK 50–100MHz、12bit为37.5–100MHz；首页配对示意934/964。本条未指定或核验具体接收器模式，不从输入位深推导物理线速，mask及物理速率均unavailable。 |
| GMSL2协议族 | [ADI Channel Specification](https://www.analog.com/media/en/technical-documentation/user-guides/gmsl2-channel-specification-user-guide.pdf)，Rev1，2023-10，pp.4–10/17–21 | 3/6Gbps固定NRZ，每链路独立；完整pin-to-pin、cable、TX/RX PCB IL/RL公式。只核验协议族，不代表某个未指定器件组合支持相应配置。 |
| LEONI Dacar302 | [原厂Automotive Cables目录](https://d6ps5s74stj59.cloudfront.net/fileadmin/acs/files/publications/product_information/leoni_automotive_cable_solutions_en.pdf)，2019-02，pp.80–81 | 50Ω，85120380D行；1/2.2/2.8GHz分别48.9/74/84.4dB/100m。历史目录参考值，不是当前供货上限；未确认衰减温度。 |
| 天信同轴26AWG | [原厂产品页](https://www.tition.com/products_72/598.html)，上架2023-08-25，产品参数 | 50±3Ω；1/2/2.5GHz分别86.7/132/152.5dB/100m，明确为20℃典型值。 |
| Caleb STP 10GBase-T1 | [原厂单页](https://www.calebcable.com/Upload/STP%2010GBase-T1%20Ethernet%20Cable-4.pdf)，无版本日期，p.1 | 100±5Ω；1/3/5.5GHz分别1/2/3dB/m。原表标Limit，不能称典型值，不能由以太网线材名称推定GMSL合格。 |
| Caleb STP 1000Base-T1，未列入可选样本 | [原厂单页](https://www.calebcable.com/Upload/STP%201000Base-T1%20Ethernet%20Cable-3.pdf)，p.1 | IL/RL公开表最高600MHz，不能用于GHz频段外推；不因1000Base-T1名称补猜GHz性能。 |
| 连接器一般预算 | [ADI Hardware Design Guide](https://www.analog.com/media/en/technical-documentation/user-guides/public-gmsl2-hardware-design-and-validation-guide.pdf)，UG-2212 Rev3，2025-08，pp.19–20 | 通用建议为连接器插损通常<0.5dB@3GHz。工具0–0.5dB区间以及较低频率应用是通用假设，不是品牌认证、每对插保证或厂商频响曲线。 |
| Rosenberger H-MTD | [2024目录](https://www.rosenberger.com/fileadmin/content/headquarter/Downloads/Differential_Data_Connectors/H-MTD_Catalog_2024.pdf)，pp.12–13 | Code E6：100Ω、随线材类型0.01–20GHz及RL；未在该系列参数表取得可采用的IL值，故IL标unavailable。H-MTD e是另一系列，不能移用其IL公式。 |
| 信瀚连接器 | 尚无确定的公开型号来源 | 品牌身份、料号、参考面、IL/RL均TBD；不借同音公司或其他品牌补值。目录条目所列ADI链接只解释通用设计参考，不是信瀚性能证据。 |

## mask转换与边界

`model: 'sqrt-linear'`的系数`[a,b,c]`表示`a*sqrt(fGHz)+b*fGHz+c`，将原文MHz平方根项乘以`sqrt(1000)`后换为GHz；不是拟合。IL的`comparison:'min'`表示测得S21/Sdd21须不低于mask，RL的`comparison:'max'`表示S11/Sdd11须不高于mask。与以正值呈现的衰减预算勿混用符号。

ADI p.9 Eq.2/3为total IL，p.19 Eq.7–10为PCB/cable IL；p.10 Eq.4为total RL，pp.20–21 Eq.11/12为PCB/cable RL。原文在5MHz等处有跳变及边界舍入差异，保留原分段，不平滑；边界同时落入两段时取较严格约束。3Gbps的IL范围至2GHz，6Gbps的IL至3.5GHz；两种模式的原文RL公式均覆盖2MHz至3.5GHz，按原文保留。

PCB模块包含板端连接器和板上器件，cable模块包含线端连接器和中间对插。使用实测模块S参数时不得再把包含的连接器重复加入预算。RL不能以dB相加；整体仍需pin-to-pin测量。仅IL/RL曲线或单频点线束估算不覆盖串扰、温度、老化、阻抗波动、PoC负载与link margin等完整规范要求。

## 数据限制

线材仅在已提供频点范围内线性插值，不外推；对厂商limit数据作线性插值仅为工具估算，并不证明频点之间的实际连续上限。典型/目录参考线损不应包装为最坏条件。连接器数量需按对插和参考面核对，通用假设的0dB下界是估算范围起点，不是实测零损耗。Rosenberger/信瀚未取得的具体料号数据继续为TBD。

本轮浏览工具对Caleb 10G单页截图一度返回Cache miss，但可抽取其原始PDF表；ADI直接下载首次被截断至1MiB，按HTTP Range取得完整1054586字节，并渲染pp.9/10/19/20复核平方根、符号与分段。未安装额外依赖。所有来源均为公共资料，没有使用非公开附件补全公式。
