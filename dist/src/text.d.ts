export declare function detectLineEnding(content: string): '\r\n' | '\n';
export declare function normalizeToLF(text: string): string;
export declare function restoreLineEndings(text: string, ending: '\r\n' | '\n'): string;
export declare function stripBom(content: string): {
    bom: string;
    text: string;
};
