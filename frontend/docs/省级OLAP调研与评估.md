# 省级 OLAP 调研与评估

当前版本覆盖五种基本操作，适合用现有 Mock 样本演示。切片、切块和行列互换均有实际计算。上卷和下钻只实现了城市与企业之间的层级。作为日常分析工具，优先补全筛选状态、层级导航和多字段透视。全省生产规模另需共享环境验证。

## 企业产品对照

| 企业与参考产品 | 公开文档展示的做法 | 对本项目的启发 |
| --- | --- | --- |
| IBM | 把上卷、下钻、切片、切块和旋转分别定义为层级聚合、层级细分、单维选值、多维取交集和改变数据视角。[OLAP 概述](https://www.ibm.com/think/topics/olap) | 用这五种操作验收数据是否正确。立方体可以用切片与透视矩阵表达。 |
| Microsoft Excel 与 Analysis Services | 透视表按字段组织行、列和筛选，单个区域可放多个字段。切片器显示当前选择。对去重计数和按时间不可直接相加的快照指标，按度量定义聚合。[字段列表](https://support.microsoft.com/en-us/excel/get-started/use-the-field-list-to-arrange-fields-in-a-pivottable) [透视表筛选](https://support.microsoft.com/en-us/excel/get-started/filter-data-in-a-pivottable) [聚合函数](https://learn.microsoft.com/en-us/analysis-services/multidimensional-models/use-aggregate-functions?view=sql-analysis-services-2025) | 让当前分析条件始终可见，支持同一行轴嵌套城市和行业，区分各期岗位快照与跨期累计。 |
| Oracle Essbase 与 Smart View | 用 Zoom In / Zoom Out 切换层级，用 Keep Only / Remove Only 快速选择成员，可在行、列、视点之间移动维度。单元格可穿透到来源明细。[即席分析](https://docs.oracle.com/en/cloud/saas/enterprise-performance-management-common/svurw/smart_view_behavior_options_ad_hoc.html) [维度旋转](https://docs.oracle.com/en/applications/enterprise-performance-management/smart-view/23.200/uugsv/pivoting.html) [穿透明细](https://docs.oracle.com/en/database/other-databases/essbase/21/ugess/introduction-essbase-drill-through.html) | 「只保留此成员」能少做几次筛选。移动维度时应保留分析范围，变化需要明确提示。 |
| SAP Analytics Cloud | 表格支持调整各维度的可见层级与交换行列。Data Analyzer 允许增加或移除维度与度量，也可保存分析状态。[表格操作](https://help.sap.com/doc/00f68c2e08b941f081002fd3691d86a7/2023.20/en-US/54ddec5623be41cfa576978a11a99ba4.html) [Data Analyzer](https://help.sap.com/doc/00f68c2e08b941f081002fd3691d86a7/2023.20/en-US/1c0375d3c0a9429fb74bd7a0a9d1056f.html) | 在已有矩阵上增加层级选择和常用视图即可改善重复分析。 |

## 当前功能核对

| 操作 | 结论 | 现有行为与边界 |
| --- | --- | --- |
| 上卷 Roll-up | 基础满足 | 收起某市的企业明细可回到城市小计。合计依据事实记录独立计算，展开城市时不会重复计入。缺少显式的「全省 → 城市 → 企业」导航。 |
| 下钻 Drill-down | 基础满足 | 所属市放在行轴或列轴时，可展开城市查看企业。行业、性质和调查期目前是平面维度。点击数值查看报表属于另一项操作「穿透明细」。 |
| 切片 Slice | 已满足 | 选定一个调查期或一个人员变动类别，矩阵按该层计算。空期可选择并显示无样本。切片维度改变，或筛选后非调查期成员消失时，代码会把选中层重置为全部层。 |
| 切块 Dice | 已满足 | 同一维度的多选取并集，不同维度取交集。例如同时选两座城市和「增员」。筛选区折叠后只显示「已应用」，看不到具体成员。 |
| 旋转 Pivot | 基础满足 | 交换行列会保留当前切片和筛选，修改轴也能更换维度。每个轴只能放一个维度。把当前切片维度换到行或列时，切片选择会被清空，可能扩大样本范围。 |

依据为 `ProvinceOlapView.vue` 的视图状态、`utils/olap.ts` 的筛选和聚合及 `tests/olap.spec.ts` 的现有用例。下列数字来自本地演示样本，用于验收。

1. 将行设为「所属市」，列设为「人员变动」，切片维度选「调查期」。点 6 月，合计净增 15。展开昆明应看到两家企业净变化 +12、−8，城市小计为 +4。收起后回到 +4，全省合计仍为 +15。
2. 保留 6 月，筛选昆明市、曲靖市及「增员」，合计应为 +24。交换行列后合计仍为 +24。点昆明增员单元格应查到一份净增 12 人的报表。
3. 选 9 月应显示无样本。6 月「不变」的净变化为 0。6 月苍山零售建档为 0、调查岗位为 5，其变化占比为「—」。三种情况分别表达。

## 改进顺序

1. 先把筛选条件和切片做成常驻标签，支持单项移除和清除。旋转、调整布局或刷新时保留查询范围。如果用户明确选择了互相冲突的切片和筛选，显示空结果并指出冲突。增加「只看此市」与「返回上一级」。这项优先修复可能静默扩大样本范围的问题。
2. 补齐「全省 → 城市 → 企业」的显式层级，并支持同轴放两个有分析价值的字段，例如行「城市 / 行业」、列「调查期」。可同时显示企业数、净变化、变化占比，减少来回切换。区县和行业父级依赖可追溯的契约字段，先核对数据再加。调查期可按开始时间归入年、季度或月，但要先约定上卷度量，保留「累计人次」的标识。若新增「期末岗位数」，单独定义取值规则，避免把各期快照相加后当作某个时点的人数。[Microsoft 半可加度量说明](https://learn.microsoft.com/en-us/analysis-services/multidimensional-models/define-semiadditive-behavior?view=sql-analysis-services-2025)
3. 共享环境确认后再定容量方案。当前浏览器每批最多读取 12 期、12,000 条明细。若实际数据达到上限，优先由后端按维度组合聚合并返回同一查询快照，点击单元格时再分页取对应报表。验收应测多市多期、修订作废后刷新、跨期企业去重，以及读分页期间数据变化。

本轮为企业产品文档调研与现有实现评估，产品说明来自厂商官方资料。企业内部使用情况及共享服务器表现未实测。
