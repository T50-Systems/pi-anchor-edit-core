import type { EditParams, PiClient, ReadParams } from './types.js';
export declare class FilesystemPiClient implements PiClient {
    protected replaceTemporaryFile(temporaryPath: string, destinationPath: string): Promise<void>;
    private atomicWrite;
    read({ path, offset, limit }: ReadParams): Promise<string>;
    edit({ path, edits }: EditParams): Promise<string>;
}
