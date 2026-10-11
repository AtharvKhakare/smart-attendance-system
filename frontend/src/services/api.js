import axios from 'axios';

const configuredBase = import.meta.env.VITE_API_BASE_URL;
const baseURL = configuredBase || '/api';
export const missingProductionApiUrl = import.meta.env.PROD && !configuredBase;

export const api = axios.create({ baseURL, timeout: 20000 });

let accessToken = null;
export function setAccessToken(token) {
  accessToken = token || null;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

export function getApiError(error) {
  return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Something went wrong.';
}
