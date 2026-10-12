import type { ChatMessage } from '../types';

const messageTime = (message: Pick<ChatMessage, 'createdAt' | 'timestamp'>) => {
  for (const value of [message.createdAt, message.timestamp]) {
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Keep the conversation stream stable and chronological, regardless of API page order. */
export function sortMessagesChronologically(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => messageTime(left.message) - messageTime(right.message) || left.index - right.index)
    .map(({ message }) => message);
}
