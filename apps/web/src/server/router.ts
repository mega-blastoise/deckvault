import { handleRequest } from './lib/handleRequest';
import { middleware } from './lib/middleware/middleware';
import {
  isBffRoute,
  routeBffRequest,
  proxyToRestApi,
  proxyToGraphqlApi
} from './bff';
import { isGraphQLRoute, isRestApiRoute } from './lib/routes';

export async function router(request: Request) {
  const url = new URL(request.url);

  /**
   * Proxy requests to the backend-for-frontend pattern handlers
   * For more information on backend-for-frontend,
   * @see https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/api-integration-data-fetching.html
   */
  if (isBffRoute(url.pathname)) {
    const response = await routeBffRequest(request);
    if (response) return response;
  }

  if (isRestApiRoute(url.pathname)) {
    return await proxyToRestApi(request);
  }

  if (isGraphQLRoute(url.pathname)) {
    return await proxyToGraphqlApi(request);
  }

  middleware(request);
  return handleRequest(request);
}
