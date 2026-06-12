export type MediaflowGenerateUrlsRequest = {
  mediaflow_proxy_url: string;
  api_password?: string;
  urls: Array<{
    endpoint: "/proxy/stream";
    destination_url: string;
    filename?: string;
    query_params?: Record<string, string>;
  }>;
};

export type MediaflowGenerateUrlsResponse = {
  urls?: string[];
  error?: string;
};
