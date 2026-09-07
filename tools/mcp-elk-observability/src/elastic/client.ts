import { Client, type ClientOptions } from "@elastic/elasticsearch";

export interface ElasticsearchClientConfig {
  elasticsearchUrl: string;
  elasticsearchApiKey: string;
}

export type ClientFactory = (options: ClientOptions) => Client;

const defaultClientFactory: ClientFactory = (options) => new Client(options);

/**
 * Constructs the `@elastic/elasticsearch` client from validated env config.
 * The API key is passed only through `auth.apiKey`, which the client
 * library translates into an `Authorization: ApiKey <key>` request header
 * (FR-24). The key is never interpolated into a log statement, error
 * message, or thrown value anywhere in this function (FR-19).
 */
export function createElasticsearchClient(
  config: ElasticsearchClientConfig,
  clientFactory: ClientFactory = defaultClientFactory,
): Client {
  return clientFactory({
    node: config.elasticsearchUrl,
    auth: { apiKey: config.elasticsearchApiKey },
  });
}
