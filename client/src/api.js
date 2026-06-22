import axios from "axios";

export const API_TIMEOUT_MS = 25_000;

const api = axios.create({ timeout: API_TIMEOUT_MS });

export async function getCurrentUser() {
  const response = await api.get("/api/session");
  return response.data.user;
}

export async function logout() {
  await api.post("/auth/logout");
}

export async function bypassLink({ url }) {
  const response = await api.post("/api/bypass", { url });
  return response.data.result;
}
