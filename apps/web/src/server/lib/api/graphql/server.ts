import { schema } from './schema';
import resolverDefs from './resolvers';
import {
  ApolloServer,
  HeaderMap,
  type HTTPGraphQLResponse
} from '@apollo/server';

import { getDatabase } from '../db';

export function createGraphQLSidecarServer() {
  const db = getDatabase();
  const apolloServer = new ApolloServer({
    typeDefs: schema,
    resolvers: resolverDefs.resolvers(db),
    // Log GraphQL errors
    formatError: (error) => {
      console.error('GraphQL Error:', {
        message: error.message,
        extensions: error.extensions
      });
      return {
        message: error.message,
        extensions: error.extensions
      };
    }
  });

  async function start() {
    await apolloServer.start();
  }

  async function stop() {
    return apolloServer.stop();
  }

  /**
   * Converts Apollo Server's HTTPGraphQLResponse to a Bun-compatible Response
   */
  async function toWellFormedResponse(
    gqlResponse: HTTPGraphQLResponse
  ): Promise<Response> {
    // Convert HeaderMap to Headers object
    const headers = new Headers();
    for (const [key, value] of gqlResponse.headers) {
      headers.set(key, value);
    }

    // Add CORS headers
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const status = gqlResponse.status || 200;

    // Handle complete response body
    if (gqlResponse.body.kind === 'complete') {
      return new Response(gqlResponse.body.string, {
        status,
        headers
      });
    }

    // Handle chunked/streaming response body
    // Convert AsyncIterator to ReadableStream for Bun's Response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of (
            gqlResponse.body as {
              kind: 'chunked';
              asyncIterator: AsyncIterableIterator<string>;
            }
          ).asyncIterator) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      status,
      headers
    });
  }

  async function _handleGraphQLRequest(request: Request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    const url = new URL(request.url);

    return apolloServer.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: request.method,
        headers: new HeaderMap(Array.from((request.headers as unknown as Iterable<[string, string]>))),
        search: url.search,
        body: request.body
      },
      context: async () => ({ db, request })
    });
  }

  async function handleGraphQLRequest(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    try {
      const url = new URL(request.url);

      // Parse body if present (for POST requests)
      let body: any = undefined;
      if (request.method === 'POST' && request.body) {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await request.json();
        }
      }

      const gqlResponse = await apolloServer.executeHTTPGraphQLRequest({
        httpGraphQLRequest: {
          method: request.method.toUpperCase(),
          headers: new HeaderMap(Array.from((request.headers as unknown as Iterable<[string, string]>))),
          search: url.search,
          body
        },
        context: async () => ({ db, request })
      });

      return await toWellFormedResponse(gqlResponse);
    } catch (error) {
      console.error('GraphQL request error:', error);
      return new Response(
        JSON.stringify({
          errors: [
            {
              message: 'Internal server error',
              extensions: {
                code: 'INTERNAL_SERVER_ERROR'
              }
            }
          ]
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  }

  function handleGraphiQLRequest(request: Request): Response {
    const url = new URL(request.url);
    const graphqlEndpoint = `${url.protocol}//${url.host}/graphql`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GraphiQL IDE</title>
  <style>
    body {
      height: 100vh;
      margin: 0;
      width: 100%;
      overflow: hidden;
    }
    #graphiql {
      height: 100vh;
    }
  </style>
  <script
    crossorigin
    src="https://unpkg.com/react@18/umd/react.production.min.js"
  ></script>
  <script
    crossorigin
    src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
  ></script>
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
</head>
<body>
  <div id="graphiql">Loading...</div>
  <script
    src="https://unpkg.com/graphiql@3/graphiql.min.js"
    type="application/javascript"
  ></script>
  <script>
    const fetcher = GraphiQL.createFetcher({
      url: '${graphqlEndpoint}',
    });

    const root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(
      React.createElement(GraphiQL, {
        fetcher,
        defaultEditorToolsVisibility: true,
      })
    );
  </script>
</body>
</html>
    `;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }

  return {
    start,
    handleGraphQLRequest,
    handleGraphiQLRequest,
    server: apolloServer
  };
}
