export type LoadedFile = {
    kind: 'directory';
} | {
    kind: 'symlink';
} | {
    kind: 'image';
    mimeType: string;
} | {
    kind: 'text';
    text: string;
    hadUtf8DecodeErrors?: true;
} | {
    kind: 'binary';
    description: string;
};
export declare function loadFileKindAndText(filePath: string): Promise<LoadedFile>;
