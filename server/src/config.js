const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const cfg = {
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  isProd: process.env.NODE_ENV === 'production',
  demoMode: (process.env.DEMO_MODE ?? 'true') === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  domains: (process.env.COLLEGE_EMAIL_DOMAIN || 'college.edu')
    .split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || '',
  tzOffsetMin: num(process.env.CAMPUS_TZ_OFFSET_MIN, 330),
  dailyCapMin: Math.round(num(process.env.DAILY_EARN_CAP_HOURS, 4) * 60),
  welcomeMin: Math.round(num(process.env.WELCOME_CREDITS_HOURS, 3) * 60),
  llmProvider: (process.env.LLM_PROVIDER || 'gemini').toLowerCase(),
  llmKey: process.env.LLM_API_KEY || '',
  embeddingModel: process.env.EMBEDDING_MODEL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'TimeBank <no-reply@timebank.app>',
  },
};

if (cfg.isProd && cfg.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

export const CATEGORIES = ['Programming', 'Design', 'Languages', 'Music', 'Academics', 'Career', 'Arts & Crafts', 'Fitness', 'Other'];
export const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'];
export const DURATIONS = [30, 60, 90, 120];

// Match-score weights (must sum to 1). Shown in the UI so judges can see the model.
export const WEIGHTS = { fit: 0.4, availability: 0.25, rating: 0.2, reciprocity: 0.15 };
