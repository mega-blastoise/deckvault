export interface HttpResponseErrorConstructorOptions {
  message: string;
  response: Response;
}

export default abstract class HttpResponseError extends Error {
  response: Response;
  constructor(options: HttpResponseErrorConstructorOptions) {
    super(options.message);
    this.response = options.response;
  }
}
