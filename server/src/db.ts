import postgres from 'postgres';
import { env } from './env.js';

export const sql = postgres(env.DATABASE_URL, {
  max: 5,
  // bigint приходит строкой — приводим через Number() там, где нужно
  transform: { undefined: null },
});

export async function track(userId: number | null, name: string, props: Record<string, unknown> = {}) {
  try {
    await sql`insert into events (user_id, name, props) values (${userId}, ${name}, ${sql.json(props as never)})`;
  } catch (e) {
    console.error('track failed', name, e);
  }
}
