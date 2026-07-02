import type { EditParams, PiClient, ReadParams } from './types.js';
export declare class FilesystemPiClient implements PiClient {
    read({ path, offset, limit }: ReadParams): Promise<string>;
    edit({ path, edits }: EditParams): Promise<string>;
}
