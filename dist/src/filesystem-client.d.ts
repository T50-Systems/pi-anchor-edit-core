import type { FileHandle } from 'node:fs/promises';
import type { EditParams, PiClient, ReadParams } from './types.js';
export declare const FILESYSTEM_DURABILITY_LEVELS: {
    readonly NONE: "none";
    readonly FILE: "file";
    readonly FILE_AND_PARENT_DIRECTORY: "file-and-parent-directory";
};
export type FilesystemDurability = typeof FILESYSTEM_DURABILITY_LEVELS[keyof typeof FILESYSTEM_DURABILITY_LEVELS];
export declare const DEFAULT_FILESYSTEM_DURABILITY: FilesystemDurability;
export declare const UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS: {
    readonly DEGRADE: "degrade";
    readonly STRICT: "strict";
};
export type UnsupportedDirectorySyncBehavior = typeof UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS[keyof typeof UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS];
export declare const DEFAULT_UNSUPPORTED_DIRECTORY_SYNC_BEHAVIOR: UnsupportedDirectorySyncBehavior;
export type FilesystemPiClientConfig = {
    durability?: FilesystemDurability;
    unsupportedDirectorySync?: UnsupportedDirectorySyncBehavior;
};
export type FilesystemDurabilityErrorCode = 'E_DIRECTORY_SYNC_UNSUPPORTED' | 'E_DURABILITY_UNCONFIRMED';
export declare class FilesystemDurabilityError extends Error {
    readonly code: FilesystemDurabilityErrorCode;
    readonly destinationPath: string;
    readonly durability: FilesystemDurability;
    readonly destinationVisible: boolean;
    constructor(code: FilesystemDurabilityErrorCode, destinationPath: string, durability: FilesystemDurability, destinationVisible: boolean, cause: unknown);
}
export declare class FilesystemPiClient implements PiClient {
    private readonly durability;
    private readonly unsupportedDirectorySync;
    constructor(config?: FilesystemPiClientConfig);
    protected beforeDestinationRevalidation(_destinationPath: string): Promise<void>;
    protected applyTemporaryFileMode(temporaryPath: string, mode: number): Promise<void>;
    protected synchronizeTemporaryFile(handle: FileHandle): Promise<void>;
    protected replaceTemporaryFile(temporaryPath: string, destinationPath: string): Promise<void>;
    protected openParentDirectoryForSync(parentPath: string): Promise<FileHandle>;
    protected synchronizeParentDirectory(handle: FileHandle, _parentPath: string): Promise<void>;
    private handleDirectorySyncFailure;
    private openParentBeforeRename;
    private verifyPinnedParent;
    private synchronizeParentAfterRename;
    private observeDestination;
    private atomicWrite;
    read({ path, offset, limit }: ReadParams): Promise<string>;
    edit({ path, edits }: EditParams): Promise<string>;
}
