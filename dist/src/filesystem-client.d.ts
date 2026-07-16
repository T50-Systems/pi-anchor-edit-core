import type { EditParams, PiClient, ReadParams } from './types.js';
export declare class FilesystemPiClient implements PiClient {
    protected beforeDestinationRevalidation(_destinationPath: string): Promise<void>;
    protected replaceTemporaryFile(temporaryPath: string, destinationPath: string): Promise<void>;
    private observeDestination;
    private atomicWrite;
    read({ path, offset, limit }: ReadParams): Promise<string>;
    edit({ path, edits }: EditParams): Promise<string>;
}
