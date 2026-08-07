/// <reference types="multer" />

/**
 * Fallback se o language service do monorepo não carregar @types/multer.
 * Faz merge com a definição oficial quando ela existir.
 */
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        stream: NodeJS.ReadableStream;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      }
    }
  }
}

export {};
