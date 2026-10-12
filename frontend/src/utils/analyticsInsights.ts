export type AnalyticsData = {
  projects: { total: number; completed: number; completionRate: number };
  tasks: { total: number; completed: number; overdue: number; completionRate: number; byStatus: Record<string, number> };
  contents: { total: number; published: number; publishRate: number; byType: Record<string, number> };
  ideas: { total: number; approved: number; approvalRate: number; byStatus: Record<string, number> };
  letters: { total: number; responded: number };
  departments: { id: string; name: string; members: number; activeTasks: number; workloadIndex: number }[];
};

export type AnalyticsRecommendation = {
  id: string;
  priority: 'بالا' | 'متوسط' | 'پایین';
  impact: 'زیاد' | 'متوسط';
  feasibility: 'زیاد' | 'متوسط';
  title: string;
  basis: string;
  action: 'tasks' | 'contents' | 'thought-room' | 'secretariat' | null;
};

const count = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Number(value)) : 0;

/** Recommendations are generated only from aggregates returned by the analytics API. */
export function buildAnalyticsRecommendations(data: AnalyticsData): AnalyticsRecommendation[] {
  const recommendations: AnalyticsRecommendation[] = [];
  const overdue = count(data.tasks.overdue);
  const unpublished = Math.max(0, count(data.contents.total) - count(data.contents.published));
  const ideasInReview = count(data.ideas.byStatus.in_review);
  const unansweredLetters = Math.max(0, count(data.letters.total) - count(data.letters.responded));

  if (overdue > 0) {
    recommendations.push({
      id: 'overdue-tasks', priority: 'بالا', impact: 'زیاد', feasibility: 'زیاد', action: 'tasks',
      title: 'رسیدگی به وظایف عقب‌افتاده',
      basis: `${overdue.toLocaleString('fa-IR')} وظیفه با موعد گذشته و وضعیت غیرنهایی ثبت شده است.`,
    });
  }

  if (ideasInReview > 0) {
    recommendations.push({
      id: 'ideas-review', priority: 'متوسط', impact: 'متوسط', feasibility: 'زیاد', action: 'thought-room',
      title: 'بررسی ایده‌های در صف ارزیابی',
      basis: `${ideasInReview.toLocaleString('fa-IR')} ایده اکنون در وضعیت «در حال بررسی» است.`,
    });
  }

  if (unpublished > 0 && count(data.contents.total) > 0) {
    recommendations.push({
      id: 'content-publication', priority: 'متوسط', impact: 'زیاد', feasibility: 'متوسط', action: 'contents',
      title: 'بازبینی برنامهٔ انتشار محتوا',
      basis: `از ${count(data.contents.total).toLocaleString('fa-IR')} محتوا، ${count(data.contents.published).toLocaleString('fa-IR')} مورد منتشرشده است؛ باقی موارد لزوماً آمادهٔ انتشار نیستند.`,
    });
  }

  if (unansweredLetters > 0) {
    recommendations.push({
      id: 'unanswered-letters', priority: 'پایین', impact: 'متوسط', feasibility: 'متوسط', action: 'secretariat',
      title: 'بررسی نامه‌های بدون پاسخ ثبت‌شده',
      basis: `${unansweredLetters.toLocaleString('fa-IR')} نامه در شاخص پاسخ‌داده‌شده قرار نگرفته است.`,
    });
  }

  const departments = data.departments.filter(item => item.members > 0 && item.activeTasks > 0)
    .slice().sort((left, right) => left.workloadIndex - right.workloadIndex);
  if (departments.length >= 2) {
    const medianIndex = Math.floor((departments.length - 1) / 2);
    const median = departments[medianIndex].workloadIndex;
    const highest = departments[departments.length - 1];
    const gap = highest.workloadIndex - median;
    if (gap >= 20 && highest.workloadIndex >= Math.max(35, median * 1.75)) {
      recommendations.push({
        id: 'workload-balance', priority: 'پایین', impact: 'متوسط', feasibility: 'متوسط', action: null,
        title: 'بازبینی توزیع شاخص بار وظیفه‌ای دپارتمان‌ها',
        basis: `شاخص بارِ هر عضو در «${highest.name}» ${highest.workloadIndex.toLocaleString('fa-IR')} و میانهٔ دپارتمان‌های دارای وظیفه ${median.toLocaleString('fa-IR')} است؛ این شاخص درصد ظرفیت نیست.`,
      });
    }
  }

  const priorityOrder = { 'بالا': 0, 'متوسط': 1, 'پایین': 2 };
  return recommendations.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);
}
