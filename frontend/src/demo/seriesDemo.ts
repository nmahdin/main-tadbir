import type { Content, ContentSeries, SeriesPeriodPreview, SeriesRevision, SeriesSummary } from '../types';
import type { ApiCollection, ApiResponse } from '../api/client';
import type { seriesApi } from '../api/series';
import { toPersianDigits } from '../utils/jalali';

/**
 * دادهٔ نمایشی مجموعه‌های محتوا.
 *
 * حالت نمایشی فقط‌خواندنی است و هیچ نوشتنی روی سرور انجام نمی‌دهد؛ این ماژول
 * همان قرارداد خواندنی `seriesApi` را با دادهٔ درون‌حافظهٔ نمایشی پاسخ می‌دهد تا
 * صفحهٔ «مجموعه‌های محتوا» و تقویم روزهای هر مجموعه در حالت نمایشی هم کامل
 * دیده شوند. روزها با حساب میلادی و نسبت به امروز ساخته می‌شوند تا تقویم
 * نمایشی همیشه بازهٔ جاری را نشان دهد؛ قالب برچسب‌ها و کلید دوره‌ها همان قالب
 * سرور است («هفته ۳»، «ماه ۱۰ / ۲۰۲۶»، `weekly-003`).
 */

const pad = (value: number) => String(value).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
/** شنبهٔ همین هفته؛ همان مبنای تقویم ایرانی. */
const startOfWeek = (base: Date) => addDays(base, -((base.getDay() + 1) % 7));
const today = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };

type SeriesSeed = {
  id: string;
  name: string;
  description: string;
  codePrefix: string;
  contentType: string;
  processTemplateId: string | null;
  projectId: string | null;
  departmentId: string;
  ownerId: string;
  publisherId: string;
  channels: string[];
  recurrenceType: ContentSeries['recurrenceType'];
  interval: number;
  deadlineOffsetDays: number;
  publicationTime: string;
  /** روز هفته برای انتشار هفتگی (۰ = شنبه). */
  weekdayOffset: number;
  dayOfMonth: number;
  createdCount: number;
  publishedCount: number;
  occurrenceLimit?: number;
  mediaGoal: string;
  targetAudiences: string[];
};

const SEEDS: SeriesSeed[] = [
  {
    id: 'ser-weekly-news', name: 'گزارش هفتگی تحول دیجیتال', codePrefix: 'WDN',
    description: 'گزارش هفتگی پیشرفت پروژه‌های تحول دیجیتال برای مدیران و ذی‌نفعان سازمان.',
    contentType: 'news', processTemplateId: null, projectId: 'proj-1', departmentId: 'dept-content',
    ownerId: 'usr-1', publisherId: 'usr-7', channels: ['website', 'linkedin'],
    recurrenceType: 'weekly', interval: 1, deadlineOffsetDays: -2, publicationTime: '09:30',
    weekdayOffset: 0, dayOfMonth: 0, createdCount: 4, publishedCount: 2,
    mediaGoal: 'اطلاع‌رسانی هفتگی پیشرفت پروژه‌ها', targetAudiences: ['مدیران و تصمیم‌گیران', 'کارکنان سازمان'],
  },
  {
    id: 'ser-monthly-infographic', name: 'اینفوگرافیک ماهانه شاخص‌های تدبیر', codePrefix: 'INF',
    description: 'اینفوگرافیک ماهانه شاخص‌های کلیدی عملکرد برای انتشار در وب‌سایت و شبکه‌های اجتماعی.',
    contentType: 'poster', processTemplateId: 'tpl-poster', projectId: null, departmentId: 'dept-graphic',
    ownerId: 'usr-3', publisherId: 'usr-7', channels: ['website', 'instagram'],
    recurrenceType: 'monthly', interval: 1, deadlineOffsetDays: -3, publicationTime: '11:30',
    weekdayOffset: 0, dayOfMonth: 15, createdCount: 2, publishedCount: 1,
    mediaGoal: 'نمایش تصویری شاخص‌های ماهانه', targetAudiences: ['کارشناسان و متخصصان'],
  },
  {
    id: 'ser-project-podcast', name: 'پادکست گفت‌وگوی تدبیر', codePrefix: 'POD',
    description: 'پادکست دو‌هفتگی گفت‌وگو با کارشناسان درباره پروژه‌های جاری سازمان.',
    contentType: 'podcast', processTemplateId: 'tpl-podcast', projectId: 'proj-1', departmentId: 'dept-media',
    ownerId: 'usr-5', publisherId: 'usr-6', channels: ['website', 'spotify'],
    recurrenceType: 'project_based', interval: 14, deadlineOffsetDays: -1, publicationTime: '18:00',
    weekdayOffset: 2, dayOfMonth: 0, createdCount: 3, publishedCount: 2, occurrenceLimit: 8,
    mediaGoal: 'گفت‌وگوی تخصصی با کارشناسان', targetAudiences: ['کارشناسان و متخصصان', 'عموم جامعه'],
  },
];

/** روز انتشار دورهٔ بعدی؛ همان روزی که هنوز نرسیده یا امروز است. */
const nextPublicationDay = (seed: SeriesSeed) => {
  const base = today();
  if (seed.recurrenceType === 'monthly') {
    const candidate = new Date(base.getFullYear(), base.getMonth(), seed.dayOfMonth || 1);
    return candidate < base ? new Date(base.getFullYear(), base.getMonth() + 1, seed.dayOfMonth || 1) : candidate;
  }
  const candidate = addDays(startOfWeek(base), seed.weekdayOffset);
  const step = seed.recurrenceType === 'project_based' ? 14 : 7 * seed.interval;
  return candidate < base ? addDays(candidate, step) : candidate;
};

/** روز هر دوره؛ دوره‌های گذشته ثبت شده‌اند و دورهٔ بعدی اولین روز محاسبه‌شده است. */
const periodDay = (seed: SeriesSeed, sequence: number) => {
  const shift = sequence - (seed.createdCount + 1);
  const anchor = nextPublicationDay(seed);
  if (seed.recurrenceType === 'monthly') return addMonths(anchor, shift * seed.interval);
  return addDays(anchor, shift * (seed.recurrenceType === 'project_based' ? seed.interval : 7 * seed.interval));
};

const periodKeyOf = (seed: SeriesSeed, sequence: number) => {
  const day = periodDay(seed, sequence);
  if (seed.recurrenceType === 'monthly') return `${day.getFullYear()}-${pad(day.getMonth() + 1)}`;
  if (seed.recurrenceType === 'project_based') return `project-${seed.projectId}-${sequence}`;
  return `weekly-${String(sequence).padStart(3, '0')}`;
};

const periodLabelOf = (seed: SeriesSeed, sequence: number) => {
  const day = periodDay(seed, sequence);
  if (seed.recurrenceType === 'monthly') return `ماه ${pad(day.getMonth() + 1)} / ${day.getFullYear()}`;
  if (seed.recurrenceType === 'project_based') return `برنامه پروژه ${sequence}`;
  return `هفته ${sequence}`;
};

const stagesOf = (seed: SeriesSeed, contentId: string, start: Date, deadline: Date, doneCount: number): Content['stages'] => {
  const plan = [
    { stageKey: 'text_prep', title: 'تأمین و تصویب متن', departmentId: 'dept-content', assigneeId: seed.ownerId, reviewerId: 'usr-2' },
    { stageKey: 'design_graphic', title: 'تولید و آماده‌سازی خروجی', departmentId: seed.departmentId, assigneeId: seed.ownerId, reviewerId: 'usr-2' },
    { stageKey: 'publish', title: 'انتشار و پایش', departmentId: 'dept-publishing', assigneeId: seed.publisherId, reviewerId: seed.publisherId },
  ];
  return plan.map((stage, index) => ({
    ...stage,
    id: `${contentId}-stg-${index + 1}`,
    description: `${stage.title} برای دورهٔ این مجموعه`,
    departmentName: '',
    order: index + 1,
    daysFromStart: index,
    startDate: isoDay(addDays(start, index)),
    deadline: isoDay(index === plan.length - 1 ? deadline : addDays(start, index + 1)),
    status: index < doneCount ? 'completed' : index === doneCount ? 'in_progress' : 'pending',
    reviewRequired: true,
    inputs: [],
    outputs: [],
  })) as Content['stages'];
};

const occurrencesOf = (seed: SeriesSeed): Content[] => {
  const rows: Content[] = [];
  for (let sequence = 1; sequence <= seed.createdCount; sequence += 1) {
    const day = periodDay(seed, sequence);
    const deadline = addDays(day, seed.deadlineOffsetDays);
    const id = `${seed.id}-cnt-${sequence}`;
    const published = sequence <= seed.publishedCount;
    const status: Content['status'] = published ? 'published' : sequence === seed.createdCount ? 'producing' : 'reviewing';
    rows.push({
      id,
      title: `${seed.name} — ${periodLabelOf(seed, sequence)}`,
      description: `${seed.description} این پروندهٔ محتوا دورهٔ ${toPersianDigits(sequence)} مجموعه را پوشش می‌دهد.`,
      type: seed.contentType,
      seriesId: seed.id,
      seriesName: seed.name,
      seriesRevisionId: `${seed.id}-rev-1`,
      seriesSequence: sequence,
      periodKey: periodKeyOf(seed, sequence),
      seriesCode: seed.codePrefix,
      plannedStartAt: `${isoDay(addDays(day, -7))}T08:00:00`,
      seriesActivatedAt: `${isoDay(addDays(day, -7))}T08:00:00`,
      projectId: seed.projectId || undefined,
      departmentId: seed.departmentId,
      ownerId: seed.ownerId,
      publisherId: seed.publisherId,
      creatorId: seed.ownerId,
      reviewerIds: ['usr-2'],
      approverId: seed.ownerId,
      processTemplateId: seed.processTemplateId || undefined,
      mediaGoal: seed.mediaGoal,
      targetAudiences: seed.targetAudiences,
      targetAudience: seed.targetAudiences[0],
      deadline: isoDay(deadline),
      status,
      createdAt: isoDay(addDays(day, -7)),
      updatedAt: isoDay(day),
      tags: ['مجموعه_محتوا', seed.codePrefix],
      tasks: [],
      assetIds: [],
      attachments: [],
      comments: [],
      publishInfo: {
        date: isoDay(day),
        time: seed.publicationTime,
        channels: seed.channels,
        status: published ? 'published' : 'planned',
        caption: `${seed.name} — ${periodLabelOf(seed, sequence)}`,
      },
      stages: stagesOf(seed, id, addDays(day, -7), deadline, published ? 3 : sequence === seed.createdCount ? 1 : 2),
    });
  }
  return rows;
};

const revisionOf = (seed: SeriesSeed): SeriesRevision => {
  const start = periodDay(seed, 1);
  return {
    id: `${seed.id}-rev-1`,
    version: 1,
    effectiveFromSequence: 1,
    contentType: seed.contentType,
    processTemplateId: seed.processTemplateId,
    recurrenceType: seed.recurrenceType,
    recurrenceConfig: {
      startDate: isoDay(start), interval: seed.interval, deadlineOffsetDays: seed.deadlineOffsetDays,
      calendar: 'jalali', dayOfMonth: seed.dayOfMonth || undefined, activationTime: '08:00',
      occurrenceLimit: seed.occurrenceLimit,
    },
    defaultContentPayload: { mediaGoal: seed.mediaGoal, targetAudiences: seed.targetAudiences },
    defaultPublicationConfig: { time: seed.publicationTime, channels: seed.channels },
    changeReason: 'نسخهٔ نخست مجموعه',
    changedBy: seed.ownerId,
    author: null,
    createdAt: isoDay(addDays(start, -14)),
  };
};

const seriesOf = (seed: SeriesSeed): ContentSeries => {
  const revision = revisionOf(seed);
  const start = periodDay(seed, 1);
  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    codePrefix: seed.codePrefix,
    contentType: seed.contentType,
    projectId: seed.projectId,
    departmentId: seed.departmentId,
    ownerId: seed.ownerId,
    processTemplateId: seed.processTemplateId,
    status: 'active',
    recurrenceType: seed.recurrenceType,
    recurrenceConfig: {
      startDate: isoDay(start), interval: seed.interval, deadlineOffsetDays: seed.deadlineOffsetDays,
      calendar: 'jalali', dayOfMonth: seed.dayOfMonth || undefined, activationTime: '08:00',
      occurrenceLimit: seed.occurrenceLimit,
    },
    defaultContentPayload: { mediaGoal: seed.mediaGoal, targetAudiences: seed.targetAudiences, stages: [] } as Partial<Content>,
    defaultPublicationConfig: { time: seed.publicationTime, channels: seed.channels, status: 'planned' },
    nextSequenceNumber: seed.createdCount + 1,
    lockVersion: 1,
    currentRevisionId: revision.id,
    currentRevisionVersion: revision.version,
    currentRevision: revision,
    occurrenceCount: seed.createdCount,
    publishedCount: seed.publishedCount,
    plannedCount: seed.createdCount - seed.publishedCount,
    activeTaskCount: 0,
    // حالت نمایشی فقط‌خواندنی است؛ عملیات نوشتنی روی دادهٔ نمایشی معنا ندارد.
    access: { edit: false, archive: false },
    createdAt: isoDay(addDays(start, -14)),
    updatedAt: isoDay(start),
  };
};

const periodOf = (seed: SeriesSeed, sequence: number, canCreate: boolean): SeriesPeriodPreview => {
  const day = periodDay(seed, sequence);
  const deadline = addDays(day, seed.deadlineOffsetDays);
  const previous = sequence > 1 ? periodDay(seed, sequence - 1) : null;
  return {
    sequence,
    periodKey: periodKeyOf(seed, sequence),
    periodLabel: periodLabelOf(seed, sequence),
    startDate: isoDay(day),
    deadline: isoDay(deadline),
    publicationDate: isoDay(day),
    publicationTime: seed.publicationTime,
    title: `${seed.codePrefix}${String(sequence).padStart(2, '0')} - ${seed.name} - ${periodLabelOf(seed, sequence)}`,
    proposedCode: `${seed.codePrefix}${String(sequence).padStart(2, '0')}`,
    previous: previous ? {
      contentId: `${seed.id}-cnt-${sequence - 1}`, code: `${seed.codePrefix}${String(sequence - 1).padStart(2, '0')}`,
      sequence: sequence - 1, periodKey: periodKeyOf(seed, sequence - 1), deadline: isoDay(addDays(previous, seed.deadlineOffsetDays)),
    } : null,
    processTemplateId: seed.processTemplateId,
    revisionId: `${seed.id}-rev-1`,
    revisionVersion: 1,
    projectId: seed.projectId,
    ownerId: seed.ownerId,
    departmentId: seed.departmentId,
    stageDeadlines: [],
    willActivateTasks: day <= today(),
    requiresManualDates: false,
    canCreate,
    limitReason: canCreate ? null : 'برنامه‌ریزی این مجموعه به سقف تعداد دوره‌ها رسیده است.',
    calendar: 'jalali',
  };
};

const periodsOf = (seed: SeriesSeed, count = 12): SeriesPeriodPreview[] => {
  const total = Math.max(1, Math.min(24, count));
  const rows: SeriesPeriodPreview[] = [];
  for (let index = 0; index < total; index += 1) {
    const sequence = seed.createdCount + 1 + index;
    const reachedLimit = Boolean(seed.occurrenceLimit && sequence > seed.occurrenceLimit);
    rows.push(periodOf(seed, sequence, !reachedLimit));
    if (reachedLimit) break;
  }
  return rows;
};

const seriesById = (id: string) => {
  const seed = SEEDS.find(item => item.id === id);
  return seed ? { seed, series: seriesOf(seed) } : null;
};

const paginate = <T,>(rows: T[], page: number, perPage: number): ApiCollection<T> => {
  const start = (Math.max(1, page) - 1) * perPage;
  return {
    data: rows.slice(start, start + perPage),
    meta: {
      current_page: Math.max(1, page), last_page: Math.max(1, Math.ceil(rows.length / perPage)),
      per_page: perPage, total: rows.length,
    },
  };
};

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** همان قرارداد خواندنی سرویس مجموعه‌ها، پاسخ‌داده‌شده از دادهٔ نمایشی درون‌حافظه. */
export const seriesDemo: Pick<typeof seriesApi, 'list' | 'workspaceSummary' | 'get' | 'preview' | 'schedule' | 'occurrences' | 'itemSummary' | 'revisions'> = {
  list: async (params = {}) => {
    const search = String(params.search || '').trim();
    const ownerId = String(params.ownerId || '');
    const rows = SEEDS.map(seriesOf).filter(series => {
      if (params.projectId && series.projectId !== String(params.projectId)) return false;
      if (params.status && series.status !== String(params.status)) return false;
      if (ownerId && series.ownerId !== ownerId) return false;
      if (params.recurrenceType && series.recurrenceType !== String(params.recurrenceType)) return false;
      if (params.contentType && series.contentType !== String(params.contentType)) return false;
      if (search && !`${series.name} ${series.description} ${series.codePrefix || ''}`.includes(search)) return false;
      return true;
    });
    return paginate(rows, asNumber(params.page, 1), asNumber(params.per_page, 20));
  },
  workspaceSummary: async (): Promise<ApiResponse<SeriesSummary>> => {
    const series = SEEDS.map(seriesOf);
    return {
      data: {
        total: series.length,
        active: series.filter(item => item.status === 'active').length,
        paused: series.filter(item => item.status === 'paused').length,
        archived: series.filter(item => item.status === 'archived').length,
        occurrences: series.reduce((total, item) => total + item.occurrenceCount, 0),
        published: series.reduce((total, item) => total + item.publishedCount, 0),
        waitingActivation: series.reduce((total, item) => total + item.plannedCount, 0),
      },
    };
  },
  get: async id => {
    const found = seriesById(id);
    if (!found) throw new Error('مجموعهٔ نمایشی پیدا نشد.');
    return { data: { ...found.series, contents: occurrencesOf(found.seed), revisions: [revisionOf(found.seed)] } };
  },
  preview: async id => {
    const found = seriesById(id);
    if (!found) throw new Error('مجموعهٔ نمایشی پیدا نشد.');
    return { data: periodOf(found.seed, found.series.nextSequenceNumber, true) };
  },
  schedule: async (id, count = 6) => {
    const found = seriesById(id);
    if (!found) throw new Error('مجموعهٔ نمایشی پیدا نشد.');
    return { data: periodsOf(found.seed, count) };
  },
  occurrences: async (id, params = {}) => {
    const found = seriesById(id);
    if (!found) throw new Error('مجموعهٔ نمایشی پیدا نشد.');
    const search = String(params.search || '').trim();
    const status = String(params.status || '');
    const activation = String(params.activation || '');
    const rows = occurrencesOf(found.seed)
      .filter(content => (search ? `${content.title} ${content.code || ''}`.includes(search) : true))
      .filter(content => (status ? content.status === status : true))
      .filter(content => (activation === 'active' ? Boolean(content.seriesActivatedAt) : activation === 'waiting' ? !content.seriesActivatedAt : true))
      .sort((left, right) => (right.seriesSequence || 0) - (left.seriesSequence || 0));
    return paginate(rows, asNumber(params.page, 1), asNumber(params.per_page, 20));
  },
  itemSummary: async id => {
    const found = seriesById(id);
    if (!found) throw new Error('مجموعهٔ نمایشی پیدا نشد.');
    const contents = occurrencesOf(found.seed);
    const planned = periodsOf(found.seed, 12)[0];
    return {
      data: {
        total: contents.length,
        published: contents.filter(content => content.status === 'published').length,
        inProgress: contents.filter(content => content.status === 'producing').length,
        producing: contents.filter(content => content.status === 'producing').length,
        waitingReview: contents.filter(content => content.status === 'reviewing').length,
        readyPublish: contents.filter(content => content.publishInfo?.status === 'ready').length,
        overdue: 0,
        delayed: 0,
        planned: planned ? 1 : 0,
        archived: 0,
        latestCode: `${found.seed.codePrefix}${String(found.seed.createdCount).padStart(2, '0')}`,
        next: planned,
      },
    };
  },
  revisions: async (id, page = 1) => {
    const found = seriesById(id);
    if (!found) throw new Error('مجموعهٔ نمایشی پیدا نشد.');
    return paginate([revisionOf(found.seed)], page, 20);
  },
};

export const INITIAL_CONTENT_SERIES: ContentSeries[] = SEEDS.map(seriesOf);
export const INITIAL_SERIES_CONTENTS: Content[] = SEEDS.flatMap(occurrencesOf);
