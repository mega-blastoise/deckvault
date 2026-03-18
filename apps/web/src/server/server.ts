import { handleRequest } from './lib/handleRequest';
import { middleware } from './lib/middleware/middleware';
import {
  isBffRoute,
  routeBffRequest,
  proxyToRestApi,
  proxyToGraphqlApi
} from './bff';

export const serve = async () => {
  return Bun.serve({
    port: 3000,
    async fetch(req) {
      const url = new URL(req.url);

      // Handle BFF routes (aggregated data for frontend)
      if (isBffRoute(url.pathname)) {
        const bffResponse = await routeBffRequest(req);
        if (bffResponse) {
          return bffResponse;
        }
      }

      // Proxy REST API requests to REST API microservice
      if (url.pathname.startsWith('/api/v1/')) {
        return proxyToRestApi(req);
      }

      // Proxy auth requests to REST API microservice
      if (url.pathname.startsWith('/auth/')) {
        return proxyToRestApi(req);
      }

      // Proxy GraphQL requests to GraphQL API microservice
      if (
        url.pathname.startsWith('/graphql') ||
        url.pathname.startsWith('/graphiql')
      ) {
        return proxyToGraphqlApi(req);
      }

      middleware(req);
      return handleRequest(req);
    }
  });
};
