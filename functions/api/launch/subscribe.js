import { subscribeResponse } from './_shared.js';

export function onRequest({ request, env }) {
  return subscribeResponse(request, env);
}
