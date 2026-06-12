import axios from "axios";

import { assertOutboundProviderUrlAllowed } from "@/utils/outboundUrl.utils";

/** Outbound HTTP client with SSRF guards on every request and redirect. */
export const outboundAxios = axios.create({
  beforeRedirect: async (options) => {
    await assertOutboundProviderUrlAllowed(options.href);
  },
});

outboundAxios.interceptors.request.use(async (config) => {
  const requestUrl = axios.getUri(config);
  await assertOutboundProviderUrlAllowed(requestUrl);
  return config;
});
