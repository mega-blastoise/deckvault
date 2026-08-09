/**
 * This class satisfies a need to often take an input of type I 
 * and perform a transform to achieve an output of type O
 * 
 * For example, in our server we use `fetch(request, server)` instead of the routes object
 * to achieve a middleware
 */
export interface IConverter<I = any, O = any> {
  convert(input: I): O | Promise<O>;
  rewind(output: O): I | null;
}

/**
 * Implementations of this Abstract Class need only implement `convert(input:Input):Output`
 * 
 * 
 */
export abstract class Converter<Input, Output> implements IConverter<
  Input,
  Output
> {
  protected cmap: Map<Input, Output>;
  constructor() {
    this.cmap = new Map();
  }

  protected recordConversion(
    input: Input,
    output: Output
  ): Converter<Input, Output> {
    this.cmap.set(input, output);
    return this;
  }

  /**
   * 
   */
  abstract convert(input: Input): Output | Promise<Output>;
  
  public rewind(output: Output): Input | null {
    for (const [input, out] of this.cmap.entries()) {
      if (out === output) {
        return input;
      }
    }
    return null;
  }
}
