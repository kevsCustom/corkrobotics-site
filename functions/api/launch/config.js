import { configResponse } from './_shared.js';

export function onRequest({ request, env }) {
  return configResponse(request, env);
}
