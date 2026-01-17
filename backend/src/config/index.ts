export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sip_meetings?schema=public',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  drachtio: {
    host: process.env.DRACHTIO_HOST || 'localhost',
    port: parseInt(process.env.DRACHTIO_PORT || '9022', 10),
    secret: process.env.DRACHTIO_SECRET || 'cymru',
  },

  freeswitch: {
    host: process.env.FREESWITCH_HOST || 'localhost',
    eslPort: parseInt(process.env.FREESWITCH_ESL_PORT || '8021', 10),
    eslPassword: process.env.FREESWITCH_ESL_PASSWORD || 'ClueCon',
  },

  sip: {
    domain: process.env.SIP_DOMAIN || 'localhost',
    wssUrl: process.env.WSS_URL || 'wss://localhost:8443',
  },

  turn: {
    url: process.env.TURN_URL || 'turn:localhost:3478',
    username: process.env.TURN_USERNAME || 'turnuser',
    password: process.env.TURN_PASSWORD || 'turnpassword',
  },

  stun: {
    url: process.env.STUN_URL || 'stun:localhost:3478',
  },

  token: {
    ttlSeconds: parseInt(process.env.TOKEN_TTL_SECONDS || '900', 10),
  },
} as const;
