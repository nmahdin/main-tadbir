export const formatPersianDate = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(d);
  } catch (e) {
    return dateStr;
  }
};
