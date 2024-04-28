import { expect, describe, it } from 'vitest';
import { h } from 'hastscript';
import sidenotes from './main';
import { rehype } from 'rehype';
import {
    isValidFootnote,
    convertFootnoteToSidenote,
    findFlowParent,
    findLogicalSectionParent,
} from './util';
import { fromHtml } from 'hast-util-from-html';
import { select } from 'hast-util-select';
import { readFile } from 'node:fs/promises';

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

    it(`should return true when the list item has matching ID (with alternate pattern)
        and is beneath an element with expected data attribute
        and has a corresponding footnote link in the tree`, () => {
        const validLi = h('li', { id: 'fn:3' }, [h('p', 'This LI has the expected ID format')]);
        const tree = h('div', [
            h('p', [h('a', { href: '#fn:3' })]),
            h('section', { 'data-footnotes': '' }, [h('ol', [validLi])]),
        ]);
        const actual = isValidFootnote(validLi, tree);
        expect(actual).toBe(true);
    });

    it(`should return true when the list item has matching ID
        and is beneath an element with expected class name
        and has a corresponding footnote link in the tree`, () => {
        const validLi = h('li#user-content-fn-3', [h('p', 'This LI has the expected ID format')]);
        const tree = h('div', [
            h('p', [h('a', { href: '#user-content-fn-3' })]),
            h('div', { class: 'footnotes' }, [h('ol', [validLi])]),
        ]);
        const actual = isValidFootnote(validLi, tree);
        expect(actual).toBe(true);
    });
});

// Convert to sidenote element
const li01 = h('li#user-content-fn-3', [' ', h('p', 'This is a footnote, soon to be an endnote.')]);
const li02 = h('li#user-content-fn-1', ['\n ', h('p', 'Some other footnote'), '\n']);
const aside01 = h('aside#user-content-fn-3.Sidenote', { role: 'doc-footnote' }, [
    '\n ',
    h('p', [
        h('small', { class: 'Sidenote-small' }, [
            h('sup', { class: 'Sidenote-number' }, '5\u2009'),
            'This is a footnote, soon to be an endnote.',
        ]),
    ]),
    '\n ',
]);
const aside02 = h('aside#user-content-fn-1.Sidenote', { role: 'doc-footnote' }, [
    '\n ',
    h('p', [
        h('small', { class: 'Sidenote-small' }, [
            h('sup', { class: 'Sidenote-number' }, '7\u2009'),
            'Some other footnote',
        ]),
    ]),
    '\n ',
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

const tree01 = `<main>
  <div id="the-container">
    <p>This is some text.</p>
    <p id="the-parent">This is some text with a footnote ref.<sup><a id="user-content-fnref-1" href="#user-content-fn-1">1</a></sup></p>
    <p>Some more text.</p>
  </div>
  <section data-footnotes="">
    <ol>
      <li id="user-content-fn-1"><p>This is the footnote.</p></li>
    </ol>
  </section>
</main>`;
const tree02 = `<div class="ArticleBody-inner" id="article-body">
<p id="p-1">As a result, I think it’s important we talk about <em>Social Capital</em>. And in particular, how it decays over time
  without in-person communication. When we’re all together in the same office, building social capital can ‘just
  happen’ for many.<sup><a href="#user-content-fn-3" id="user-content-fnref-3" data-footnote-ref=""
      aria-describedby="footnote-label">1</a></sup> It doesn’t take much thought. In a friendly organisation (like
  the one I work for), it may not be automatic, but it doesn’t take much effort.</p>
<blockquote id="blockquote-1">
  <p id="p-2">When we’re co-located there is a lot of accidental, incidental, and tacit communication that helps form social
    bonds. When leading remote teams, these things must be done purposefully.<sup><a href="#user-content-fn-4"
      id="user-content-fnref-4" data-footnote-ref="" aria-describedby="footnote-label">2</a></sup></p>
</blockquote>
<section data-footnotes="" class="footnotes">
  <h2 class="sr-only" id="footnote-label">Footnotes</h2>
  <ol>
    <li id="user-content-fn-3">
      <p>Just so I’m not misunderstood, I’m aware that there are many people who find in-person interactions
        difficult and stressful. When I say it ‘just happens,’ I really mean ‘for most neurotypical people,
        much of the time.’ <a href="#user-content-fnref-3" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p>
    </li>
    <li id="user-content-fn-4">
      <p>Wayne Turmel, ‘<a
          href="https://www.management-issues.com/connected/6986/building-social-capital-in-remote-teams/">Building
          social capital in remote teams</a>,’ <em>The Connected Manager</em>, 2 December 2014. <a
          href="#user-content-fnref-4" data-footnote-backref="" aria-label="Back to reference 2"
          class="data-footnote-backref">↩</a></p>
    </li>
  </ol>
</section>
</div>`;

describe.each`
    treeStr   | fnRefId                   | expectedContainerId | expectedParentId
    ${tree01} | ${'user-content-fnref-1'} | ${'the-container'}  | ${'the-parent'}
    ${tree02} | ${'user-content-fnref-3'} | ${'article-body'}   | ${'p-1'}
    ${tree02} | ${'user-content-fnref-4'} | ${'article-body'}   | ${'blockquote-1'}
`('findSectionAndParent()', ({ treeStr, fnRefId, expectedContainerId, expectedParentId }) => {
    const tree = fromHtml(treeStr, { fragment: true });
    const fnRef = select(`#${fnRefId}`, tree);
    const expectedContainer = select(`#${expectedContainerId}`, tree);
    const expectedParent = select(`#${expectedParentId}`, tree);
    if (!fnRef) throw new Error('Could not find footnote');
    if (!expectedContainer) throw new Error('Could not find the container');
    if (!expectedParent) throw new Error('Could not find parent block element');
    it(`should return ${expectedContainer.tagName}#${expectedContainerId} section and ${expectedParent.tagName}#${expectedParentId} parent`, () => {
        expect(findLogicalSectionParent(fnRefId, tree)).toEqual(expectedContainer);
        expect(findFlowParent(fnRefId, expectedContainer)).toEqual(expectedParent);
    });
});

describe('rehypeSidenotes()', () => {
    it('should convert footnotes to sidenotes and move them to the expected place in the DOM', () => {
        const input = `<main>
          <div>
            <p>This is some text.</p>
            <p>This is some text with a footnote ref.<sup><a id="user-content-fnref-1" href="#user-content-fn-1">1</a></sup></p>
            <p>Some more text.</p>
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
            <aside class="Sidenote" id="user-content-fn-1" role="doc-footnote">
              <p><small class="Sidenote-small"><sup class="Sidenote-number">1\u2009</sup>This is the footnote.</small></p>
            </aside>
            <p>Some more text.</p>
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

    it('should handle the format used by jrsinclair.com', () => {
        const input = `<div class="ArticleBody-inner">
        <p>As a result, I think it’s important we talk about <em>Social Capital</em>. And in particular, how it decays over time
          without in-person communication. When we’re all together in the same office, building social capital can ‘just
          happen’ for many.<sup><a href="#user-content-fn-3" id="user-content-fnref-3" data-footnote-ref=""
              aria-describedby="footnote-label">1</a></sup> It doesn’t take much thought. In a friendly organisation (like
          the one I work for), it may not be automatic, but it doesn’t take much effort.</p>
        <blockquote>
          <p>When we’re co-located there is a lot of accidental, incidental, and tacit communication that helps form social
            bonds. When leading remote teams, these things must be done purposefully.<sup><a href="#user-content-fn-4"
              id="user-content-fnref-4" data-footnote-ref="" aria-describedby="footnote-label">2</a></sup></p>
        </blockquote>
        <section data-footnotes="" class="footnotes">
          <h2 class="sr-only" id="footnote-label">Footnotes</h2>
          <ol>
            <li id="user-content-fn-3">
              <p>Just so I’m not misunderstood, I’m aware that there are many people who find in-person interactions
                difficult and stressful. When I say it ‘just happens,’ I really mean ‘for most neurotypical people,
                much of the time.’ <a href="#user-content-fnref-3" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p>
            </li>
            <li id="user-content-fn-4">
              <p>Wayne Turmel, ‘<a
                  href="https://www.management-issues.com/connected/6986/building-social-capital-in-remote-teams/">Building
                  social capital in remote teams</a>,’ <em>The Connected Manager</em>, 2 December 2014. <a
                  href="#user-content-fnref-4" data-footnote-backref="" aria-label="Back to reference 2"
                  class="data-footnote-backref">↩</a></p>
            </li>
          </ol>
        </section>
      </div>`.replace(/  +/g, ' ');
        const expected = `<div class="ArticleBody-inner">
        <p>As a result, I think it’s important we talk about <em>Social Capital</em>. And in particular, how it decays over time
        without in-person communication. When we’re all together in the same office, building social capital can ‘just
        happen’ for many.<sup><a href="#user-content-fn-3" id="user-content-fnref-3" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup> It doesn’t take much thought. In a friendly organisation (like
        the one I work for), it may not be automatic, but it doesn’t take much effort.</p>
        <aside class="Sidenote" id="user-content-fn-3" role="doc-footnote">
          <p><small class="Sidenote-small"><sup class="Sidenote-number">1 </sup>Just so I’m not misunderstood, I’m aware that there are many people who find in-person interactions
          difficult and stressful. When I say it ‘just happens,’ I really mean ‘for most neurotypical people,
          much of the time.’ <a href="#user-content-fnref-3" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></small></p>
        </aside>
    <blockquote>
        <p>When we’re co-located there is a lot of accidental, incidental, and tacit communication that helps form social
            bonds. When leading remote teams, these things must be done purposefully.<sup><a href="#user-content-fn-4" id="user-content-fnref-4" data-footnote-ref="" aria-describedby="footnote-label">2</a></sup></p>
    </blockquote>
    <aside class="Sidenote" id="user-content-fn-4" role="doc-footnote">
      <p><small class="Sidenote-small"><sup class="Sidenote-number">2 </sup>Wayne Turmel, ‘<a href="https://www.management-issues.com/connected/6986/building-social-capital-in-remote-teams/">Building
          social capital in remote teams</a>,’ <em>The Connected Manager</em>, 2 December 2014. <a href="#user-content-fnref-4" data-footnote-backref="" aria-label="Back to reference 2" class="data-footnote-backref">↩</a></small></p>
    </aside>
    </div>`.replace(/  +/g, ' ');
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

    it.each`
        inputFile                     | expectedFile
        ${'test-data/fight-new.html'} | ${'test-data/fight-new-transformed.html'}
        ${'test-data/fight-old.html'} | ${'test-data/fight-old-transformed.html'}
    `('should handle complete files', async ({ inputFile, expectedFile }) => {
        const inputStr = (await readFile(__dirname + '/' + inputFile)).toString('utf-8');
        const expectedStrRaw = (await readFile(__dirname + '/' + expectedFile)).toString('utf-8');
        const expectedStr = String(
            await rehype()
                .data('settings', { characterReferences: { useNamedReferences: true } })
                .process(expectedStrRaw),
        )
            .replace(/  +/g, ' ')
            .replace(/\n\s*\n/g, '\n');
        const vFile = await rehype()
            .data('settings', { characterReferences: { useNamedReferences: true } })
            .use(sidenotes)
            .process(inputStr);
        const actual = String(vFile)
            .replace(/  +/g, ' ')
            .replace(/\n\s*\n/g, '\n');
        expect(actual).toEqual(expectedStr);
    });
});
