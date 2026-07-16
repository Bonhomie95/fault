import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // Absent key is a supported mode, not an error: the server falls back to the
  // hand-authored docket (GDD 12, "emergency buffer").
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  PORT: z.coerce.number().default(4000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

/** Whether AI generation is live. When false, every case comes from seedCases. */
export const aiEnabled = env.GROQ_API_KEY.length > 0;
