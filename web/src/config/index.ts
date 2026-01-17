export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  sipEnabled: import.meta.env.VITE_SIP_ENABLED === 'true',
  sipWssUrl: import.meta.env.VITE_SIP_WSS_URL || 'wss://localhost:7443',
};
