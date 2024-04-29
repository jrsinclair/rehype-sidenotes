import type { Element, Root } from 'hast';
import { select, selectAll } from 'hast-util-select';
import { maybeDo } from './maybe';
import {
    isValidFootnote,
    convertFootnoteToSidenote,
    findLogicalSectionParent,
    findFlowParent,
    removeEl,
    findRef,
    getText,
} from './util';

/**
 * Transform and shift a single footnote.
 *
 * @param el The footnote element to transform. It should have an ID that a footnote reference
 *           points to somewhere else in the document.
 * @param tree The tree we're transforming.
 */
const transformAndShiftFootnote = maybeDo(function* transformAndShift(
    el: Element,
    tree: Root,
): Generator<Element | Root | undefined, undefined, Element> {
    // Gather the data we need, but bail if anything returns undefined.
    if (!isValidFootnote(el, tree)) return;
    const footnoteReference = yield findRef(el, tree);
    const fnRefId = String(footnoteReference.properties.id);
    const sidenote = yield convertFootnoteToSidenote(el, getText(footnoteReference));
    const logicalSection = yield findLogicalSectionParent(fnRefId, tree);
    const parent = yield findFlowParent(fnRefId, logicalSection);
    const idx = logicalSection.children.indexOf(parent);

    // Run the effects
    logicalSection.children.splice(idx + 1, 0, { type: 'text', value: '\n ' }, sidenote);
    removeEl(el, tree);
});

/**
 * Transformer.
 *
 * Given a syntax tree, locate all the footnotes and move them into the body of the document as
 * sidenotes. Semantically, we represent a sidenote as an <aside> element with its content
 * wrapped with <small>. This means that should the HTML show up in something like an RSS reader
 * or [Readability](https://github.com/mozilla/readability), it will have a reasonable visual and
 * semantic treatment.
 *
 * @param tree The HAST syntax tree to transform.
 * @returns The mutated tree.
 */
function transformer(tree: Root) {
    // Grab all list items below the element with data attribute footnotes
    // We reverse them so that if two footnotes end up in the same location, the first one ends up
    // first.
    const listItems = selectAll('.footnotes li, [data-footnotes] li', tree).reverse();
    listItems.forEach((el) => transformAndShiftFootnote(el, tree));
    const remainingListItems = selectAll('.footnotes li, [data-footnotes] li', tree);
    if (remainingListItems.length === 0) {
        const fnSection = select('.footnotes, [data-footnotes]', tree);
        if (fnSection) removeEl(fnSection, tree);
    } else {
        console.warn('Some footnotes were not transformed.');
    }
    return tree;
}

/**
 * Sidenotes.
 *
 * Locates footnotes and moves them into the main flow of the given document as sidenotes.
 *
 * @returns A transformer that converts footnotes to sidenotes.
 */
export default function sidenotes() {
    return transformer;
}
