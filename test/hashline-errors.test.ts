import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyHashlineEdits,
  computeLineHash,
  detectLineEnding,
  normalizeToLF,
  resolveEditAnchors,
  restoreLineEndings,
  stripBom,
} from '../src/index.js';
import type { HashlineToolEdit } from '../src/hashline.js';

function ref(line: number, content: string): string {
  return `${line}#${computeLineHash(line, content)}:${content}`;
}

function apply(content: string, edits: HashlineToolEdit[]) {
  return applyHashlineEdits(content, resolveEditAnchors(edits));
}

test('replace supports single lines and ranges and rejects invalid ranges', () => {
  assert.equal(apply('a\nb\nc', [{ op: 'replace', pos: ref(2, 'b'), lines: ['B'] }]).content, 'a\nB\nc');
  assert.equal(
    apply('a\nb\nc', [{ op: 'replace', pos: ref(1, 'a'), end: ref(2, 'b'), lines: ['AB'] }]).content,
    'AB\nc',
  );
  assert.throws(
    () => apply('a\nb', [{ op: 'replace', pos: ref(2, 'b'), end: ref(1, 'a'), lines: ['x'] }]),
    /E_BAD_OP/,
  );
  assert.throws(() => apply('a', [{ op: 'replace', pos: `2#${computeLineHash(2, 'x')}`, lines: ['x'] }]), /E_RANGE_OOB/);
});

test('append and prepend support anchored and boundary forms with failures', () => {
  assert.equal(apply('a', [{ op: 'append', lines: ['z'] }]).content, 'a\nz');
  assert.equal(apply('a', [{ op: 'prepend', lines: ['z'] }]).content, 'z\na');
  assert.equal(apply('a\nb', [{ op: 'append', pos: ref(1, 'a'), lines: ['x'] }]).content, 'a\nx\nb');
  assert.equal(apply('a\nb', [{ op: 'prepend', pos: ref(2, 'b'), lines: ['x'] }]).content, 'a\nx\nb');
  assert.throws(() => apply('a', [{ op: 'append', lines: [] }]), /E_BAD_OP/);
  assert.throws(() => apply('a', [{ op: 'prepend', lines: [] }]), /E_BAD_OP/);
});

test('replace_text classifies no-match, multi-match, and empty search failures', () => {
  assert.equal(apply('alpha beta', [{ op: 'replace_text', oldText: 'beta', newText: 'gamma' }]).content, 'alpha gamma');
  assert.throws(() => apply('alpha', [{ op: 'replace_text', oldText: 'missing', newText: 'x' }]), /E_NO_MATCH/);
  assert.throws(() => apply('alpha alpha', [{ op: 'replace_text', oldText: 'alpha', newText: 'x' }]), /E_MULTI_MATCH/);
  assert.throws(() => apply('alpha', [{ op: 'replace_text', oldText: '', newText: 'x' }]), /E_BAD_OP/);
});

test('rejects malformed anchors, stale anchors, conflicts, unsafe payloads, and emptying', () => {
  assert.throws(() => resolveEditAnchors([{ op: 'replace', pos: '1', lines: ['x'] }]), /E_BAD_REF/);
  assert.throws(() => apply('a', [{ op: 'replace', pos: '1#ZZ:a', lines: ['x'] }]), /E_STALE_ANCHOR/);
  assert.throws(
    () => apply('a\nb', [
      { op: 'replace', pos: ref(1, 'a'), end: ref(2, 'b'), lines: ['x'] },
      { op: 'replace', pos: ref(2, 'b'), lines: ['y'] },
    ]),
    /E_EDIT_CONFLICT/,
  );
  assert.throws(() => resolveEditAnchors([{ op: 'replace', pos: ref(1, 'a'), lines: ['1#ZZ:copied'] }]), /E_INVALID_PATCH/);
  assert.throws(() => apply('a', [{ op: 'replace', pos: ref(1, 'a'), lines: [] }]), /E_WOULD_EMPTY/);
});

test('validates operation shapes and anchor hash syntax', () => {
  assert.throws(() => resolveEditAnchors([{ op: 'unknown' }]), /E_BAD_OP/);
  assert.throws(() => resolveEditAnchors([{ op: 'replace', pos: '1#A', lines: ['x'] }]), /E_BAD_REF/);
  assert.throws(() => resolveEditAnchors([{ op: 'replace', pos: '0#ZZ', lines: ['x'] }]), /E_BAD_REF/);
  assert.throws(() => resolveEditAnchors([{ op: 'replace', pos: '1#12', lines: ['x'] }]), /E_BAD_REF/);
  assert.throws(
    () => resolveEditAnchors([{ op: 'append', end: ref(1, 'a'), lines: ['x'] }]),
    /E_BAD_OP/,
  );
});

test('text helpers preserve their documented normalization behavior', () => {
  assert.equal(detectLineEnding('a\r\nb'), '\r\n');
  assert.equal(detectLineEnding('a\nb'), '\n');
  assert.equal(normalizeToLF('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(restoreLineEndings('a\nb', '\r\n'), 'a\r\nb');
  assert.deepEqual(stripBom('\uFEFFtext'), { bom: '\uFEFF', text: 'text' });
  assert.deepEqual(stripBom('text'), { bom: '', text: 'text' });
});
