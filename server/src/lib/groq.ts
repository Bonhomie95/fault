import Groq from 'groq-sdk';
import { aiEnabled, env } from './env.js';

export const groq = aiEnabled ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

export const GROQ_MODEL = env.GROQ_MODEL;
