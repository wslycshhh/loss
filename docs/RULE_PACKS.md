# 本地规则包

通用 JSON 根结构为 `{ "schemaVersion": 1, "packId": "unique-id", "rules": [...] }`。规则和每个嵌套对象采用字段白名单；未知字段、重复 ruleId、非法数值、无序/重叠频段、执行表达式均拒绝。先验证整个包，再合并状态。

每条规则包含 `ruleId, vendor, serializer, deserializer, direction, media, physicalLinkCounts, verificationStatus, source, rate, lossMasks`，可选 `notes`。`direction` 是 `display/camera/both`，`media` 是 `STP/Coax` 数组。

`source` 字段：`title, url, revision, section, checkedAt, visibility`。公开来源必须有 HTTP(S) URL；受限或合成数据可留空 URL。日期为 ISO 日期；可见级别为 `public/restricted/synthetic`。来源文本按文本展示，不能注入网页。

`rate.kind` 是 `frame/fixed/unavailable`。前两者分别要求 `frameBits` 或 `lineRateGbps`。`modulation` 为 `NRZ/PAM4/unknown`。可选 `allowEvenSplit`、`pixelsPerClockSupported`、`pclkMinMHz/pclkMaxMHz`；未确认双像素转换时不能输出猜测的物理线速。固定速率始终按每个物理链路解释，不拿视频输出数量分摊。

掩码字段：`component`（`total/cable/pcb_tx/pcb_rx`）、`metric`（`S21/Sdd21/S11/Sdd11`）、`comparison`（`min/max`）、`referencePlane`、`referenceOhms`、`segments`、`verificationStatus`、可选 `source`。

每段包含 `rangeGHz:[lo,hi]` 与三个有限数值的 `coefficients`。默认 `model:polynomial` 表示 `a*f²+b*f+c`，`sqrt-linear` 表示 `a*sqrt(f)+b*f+c`；f 一律 GHz。所有结果为 signed S 参数 dB。共享端点可不连续，取更严格一侧；内部区间不允许重叠，不外推。

状态为 `verified_public/user_confirmed_vendor/pending_vendor/inferred/unavailable/demo/synthetic`。用户转述确认不等于公开书面勘误；pending 候选值可以查询，不能给实测通过。代码对一个用户自建包的状态声明进行格式验证，无法替代工程师核验其来源真实性。

附带旧格式的本地授权附件适配器仅转换数值系数及结构，不执行其中的公式字符串。该格式的损耗掩码一律保留 `pending_vendor`。原始附件与源值测试必须在公共 Git 工作树之外进行。
