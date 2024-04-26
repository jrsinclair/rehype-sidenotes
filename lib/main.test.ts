import { expect, describe, it } from 'vitest';
import { h } from 'hastscript';
import sidenotes from './main';
import { isValidFootnote, convertFootnoteToSidenote, findParentBlockElementOfRef } from './util';
import { toHtml } from 'hast-util-to-html';
import { rehype } from 'rehype';

describe('isValidFootnote()', () => {
    it('should return false when the list item’s ID does not match the expected pattern', () => {
        const nonConformingLi = h('li#does-not-conform-to-pattern', [
            h('p', 'This list item is not a footnote'),
        ]);
        const tree = h('ol', [nonConformingLi]);
        const actual = isValidFootnote(nonConformingLi, tree);
        expect(actual).toBe(false);
    });

    it('should return false when the list item is not beneath an element with the attribute data-footnotes', () => {
        const validLi = h('li#user-content-fn-3', [h('p', 'This LI has the expected ID format')]);
        const tree = h('section', { 'data-unrelated': '' }, [h('ol', [validLi])]);
        const actual = isValidFootnote(validLi, tree);
        expect(actual).toBe(false);
    });

    it('should return false if there is no corresponding reference in the parent document', () => {
        const validLi = h('li#user-content-fn-3', [h('p', 'This LI has the expected ID format')]);
        const tree = h('div', [
            h('p', [h('a', { href: '#not-a-relevant-id' })]),
            h('section', { 'data-footnotes': '' }, [h('ol', [validLi])]),
        ]);
        const actual = isValidFootnote(validLi, tree);
        expect(actual).toBe(false);
    });

    it(`should return true when the list item has matching ID
        and is beneath an element with expected data attribute
        and has a corresponding footnote link in the tree`, () => {
        const validLi = h('li#user-content-fn-3', [h('p', 'This LI has the expected ID format')]);
        const tree = h('div', [
            h('p', [h('a', { href: '#user-content-fn-3' })]),
            h('section', { 'data-footnotes': '' }, [h('ol', [validLi])]),
        ]);
        const actual = isValidFootnote(validLi, tree);
        expect(actual).toBe(true);
    });
});

// Convert to sidenote element
const li01 = h('li#user-content-fn-3', [h('p', 'This is a footnote, soon to be an endnote.')]);
const li02 = h('li#user-content-fn-1', [h('p', 'Some other footnote')]);
const aside01 = h('aside#user-content-fn-3.Sidenote', [
    h('p', [
        h('small', { class: 'Sidenote-small' }, [
            h('sup', { class: 'Sidenote-number' }, '5\u2009'),
            'This is a footnote, soon to be an endnote.',
        ]),
    ]),
]);
const aside02 = h('aside#user-content-fn-1.Sidenote', [
    h('p', [
        h('small', { class: 'Sidenote-small' }, [
            h('sup', { class: 'Sidenote-number' }, '7\u2009'),
            'Some other footnote',
        ]),
    ]),
]);
describe.each`
    input   | fnNum | expected
    ${li01} | ${5}  | ${aside01}
    ${li02} | ${7}  | ${aside02}
`('convertFootnoteToSidenote()', ({ input, fnNum, expected }) => {
    it(`should return the expected element`, () => {
        expect(convertFootnoteToSidenote(input, fnNum)).toEqual(expected);
    });
});

// Find parent block element of corresponding reference
const fn01 = li01;
const fn02 = li02;
const ref01 = h('a#user-content-fnref-3', { href: `#${li01.properties.id}` }, '5');
const ref02 = h('a#user-content-fnref-1', { href: `#${li02.properties.id}` }, '7');
const expected01 = h('p', [h('span', ['some random text', h('sup', [ref01])])]);
const expected02 = h('p', ['some random text', h('sup', [ref02])]);
const tree01 = h('div', [expected01, h('section', { 'data-footnotes': '' }, [h('ol', [fn01])])]);
const tree02 = h('blockquote', [
    expected02,
    h('section', { 'data-footnotes': '' }, [h('ol', [fn01])]),
]);
describe.each`
    footnote | tree      | expected
    ${fn01}  | ${tree01} | ${expected01}
    ${fn02}  | ${tree02} | ${expected02}
`('findParentBlockElementOfRef()', ({ footnote, tree, expected }) => {
    it('should find the parent block element of the corresponding reference', () => {
        const actual = findParentBlockElementOfRef(footnote, tree) ?? [];
        expect(toHtml(actual)).toBe(toHtml(expected));
    });
});

describe('rehypeSidenotes()', () => {
    it('should convert footnotes to sidenotes and move them to the expected place in the DOM', () => {
        const input = `<main>
          <div>
            <p>This is some text.</p>
            <p>This is some text with a footnote ref.<sup><a id="user-content-fnref-1" href="#user-content-fn-1">1</a></sup></p>
          </div>
          <section data-footnotes="">
            <ol>
              <li id="user-content-fn-1"><p>This is the footnote.</p></li>
            </ol>
          </section>
        </main>`.replace(/  +/g, ' ');
        const expected = `<main>
          <div>
            <p>This is some text.</p>
            <p>This is some text with a footnote ref.<sup><a id="user-content-fnref-1" href="#user-content-fn-1">1</a></sup></p>
            <aside class="Sidenote" id="user-content-fn-1"><p><small class="Sidenote-small"><sup class="Sidenote-number">1\u2009</sup>This is the footnote.</small></p></aside>
          </div>
        </main>`.replace(/  +/g, ' ');
        rehype()
            .data('settings', { fragment: true, characterReferences: { useNamedReferences: true } })
            .use(sidenotes)
            .process(input, (err, file) => {
                if (err != undefined) throw err;
                expect(
                    String(file)
                        .replace(/  +/g, ' ')
                        .replace(/\n\s*\n/g, '\n'),
                ).toEqual(expected);
            });
    });
});
