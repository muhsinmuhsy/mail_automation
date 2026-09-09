declare module 'mjml' {
  export interface MjmlError {
    line: number;
    message: string;
    tagName: string;
    formattedMessage: string;
  }

  export interface MjmlRenderResult {
    html: string;
    json: unknown;
    errors: MjmlError[];
  }

  export interface MjmlOptions {
    minify?: boolean;
    validationLevel?: 'strict' | 'soft' | 'skip';
    filePath?: string;
    keepComments?: boolean;
    socialAttributes?: boolean;
    inline?: boolean;
  }

  function mjml2html(input: string, options?: MjmlOptions): Promise<MjmlRenderResult>;
  export default mjml2html;
}
