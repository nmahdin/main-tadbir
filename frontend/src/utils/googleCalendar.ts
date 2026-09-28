/**
 * Google Calendar integration (no-auth level).
 *
 * Builds a "Add to Google Calendar" template link that opens the user's own
 * Google Calendar with a pre-filled event. Works without any OAuth setup —
 * the user just needs to be signed in to Google in their browser.
 *
 * Full two-way sync (listing the user's Google events inside Tadbir and
 * pushing changes back) requires a Google Cloud OAuth client + backend
 * token storage; this helper is the zero-config first step.
 */

export interface GoogleCalendarEventInput {
  title: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Optional ISO end date (YYYY-MM-DD). Defaults to the same day. */
  endDate?: string;
  details?: string;
  location?: string;
}

const toGoogleDate = (isoDate: string): string => isoDate.slice(0, 10).replace(/-/g, '');

export const buildGoogleCalendarTemplateUrl = (input: GoogleCalendarEventInput): string => {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toGoogleDate(input.date)}/${toGoogleDate(input.endDate || input.date)}`,
  });
  if (input.details) params.set('details', input.details);
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const openInGoogleCalendar = (input: GoogleCalendarEventInput): void => {
  window.open(buildGoogleCalendarTemplateUrl(input), '_blank', 'noopener,noreferrer');
};
