// 根据 W6 OpenAPI 0.6.0 的 schema 维护。
export type FilingSourceCounts = { SNAPSHOT_VERSION: number; CURRENT_FALLBACK: number; UNAVAILABLE: number }
export type SixMetrics = { enterpriseCount: number; baselineEmploymentTotal: number; periodEmploymentTotal: number; netChange: number; reductionTotal: number; changePercent: number | null; filingSourceCounts: FilingSourceCounts }
export type AnalysisFilters = { regionCode: string | null; natureParentCode: string | null; natureCode: string | null; industryParentCode: string | null; industryCode: string | null }
export type CityShare = { cityOrgId: string; cityName: string; cityRegionCode: string; enterpriseCount: number; sharePercent: number }
export type CitiesAnalysis = { periodCode: string; periodLabel: string; regionCode: string | null; sampleRule: "APPROVED_PROVINCE_NOT_VOIDED_LATEST_SUBMISSION_EFFECTIVE_VALUES"; totalEnterpriseCount: number; empty: boolean; cities: Array<CityShare> }
export type ComparePeriod = { position: "FIRST" | "SECOND"; periodCode: string; periodLabel: string; startAt: string; metrics: SixMetrics }
export type CompareAnalysis = { firstPeriodCode: string; secondPeriodCode: string; filters: AnalysisFilters; sampleRule: "APPROVED_PROVINCE_NOT_VOIDED_LATEST_SUBMISSION_EFFECTIVE_VALUES"; periods: Array<ComparePeriod> }
export type TrendPoint = { periodCode: string; periodLabel: string; startAt: string; hasSample: boolean; metrics: SixMetrics }
export type TrendAnalysis = { periodCodes: Array<string>; filters: AnalysisFilters; sampleRule: "APPROVED_PROVINCE_NOT_VOIDED_LATEST_SUBMISSION_EFFECTIVE_VALUES"; points: Array<TrendPoint> }
export type NoticeSummary = { noticeId: string; title: string; publisherOrgId: string; publisherUnitName: string; publishedAt: string; updatedAt: string | null; currentVersion: number; canEdit: boolean; canDelete: boolean }
export type NoticeDetail = { noticeId: string; title: string; publisherOrgId: string; publisherUnitName: string; publishedAt: string; updatedAt: string | null; currentVersion: number; canEdit: boolean; canDelete: boolean; content: string; publisherUserId: string }
export type NoticePage = { items: Array<NoticeSummary>; total: number; page: number; size: number }
export type NoticeCreate = { title: string; content: string }
export type NoticeUpdate = { expectedVersion: number; title: string; content: string }
export type NoticeDeleteResult = { noticeId: string; currentVersion: number; deleted: true; deletedAt: string }
