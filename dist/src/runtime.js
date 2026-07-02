export function throwIfAborted(signal) {
    if (signal?.aborted)
        throw new Error('Operation aborted');
}
