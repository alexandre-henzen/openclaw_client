import { Response } from 'express';
import { Readable } from 'stream';

export async function pipeWebResponse(res: Response, webRes: globalThis.Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!webRes.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(webRes.body as import('stream/web').ReadableStream);
  nodeStream.pipe(res);
}
