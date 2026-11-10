process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';
process.env.WEB_ORIGIN ||= 'http://localhost:5173';
process.env.ACCESS_TOKEN_TTL ||= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ||= '14';
