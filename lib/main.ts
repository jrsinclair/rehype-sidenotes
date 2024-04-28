import type { Element, ElementContent, Root } from 'hast';
import { select, selectAll } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { maybeDo } from './maybe';
import {
    isValidFootnote,
    convertFootnoteToSidenote,
    findLogicalSectionParent,
    findFlowParent,
    isElement,
    findRef,
    getText,
} from './util';

function findParentOfEl(el: ElementContent, tree: Root | Element): Element | Root | undefined {
    if (tree.children.includes(el)) return tree;
    let foundParent = undefined;
    const childrenWithChildren = tree.children.filter(isElement) as Element[];
    for (const child of childrenWithChildren) {
        foundParent = findParentOfEl(el, child);
        if (foundParent !== undefined) return foundParent;
    }
    return undefined;
}

function removeEl(el: Element, tree: Root) {
    const parent = findParentOfEl(el, tree);
    if (!parent) return;
    const idx = parent?.children.indexOf(el);
    if (idx === -1) return;
    parent.children.splice(idx, 1);
}

const transformAndShiftFootnote = maybeDo(function* transformAndShift(
    el: Element,
    tree: Root,
): Generator<Element | Root | undefined, void, Element> {
    // Gather the data we need, but bail if anything returns undefined
    console.log('Transforming footnote: ', toHtml(el));
    if (!isValidFootnote(el, tree)) {
        console.warn('That wasn’t a valid footnote');
        return;
    }
    const footnoteReference = yield findRef(el, tree);
    console.log('Footnote reference:', toHtml(footnoteReference));
    const fnRefId = String(footnoteReference.properties.id);
    const sidenote = yield convertFootnoteToSidenote(el, getText(footnoteReference));
    console.log('Sidenote:', toHtml(sidenote));
    const logicalSection = yield findLogicalSectionParent(fnRefId, tree);
    console.log('Found logical section');
    const parent = yield findFlowParent(fnRefId, logicalSection);
    console.log('Found immediate parent');
    const idx = logicalSection.children.indexOf(parent);

    // Run the effects
    logicalSection.children.splice(idx + 1, 0, { type: 'text', value: '\n ' }, sidenote);
    console.log('Removing original footnote');
    removeEl(el, tree);
});

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
        console.warn('Some footnotes were not removed as they still remain in the DOM');
    }
    return tree;
}

export default function sidenotes() {
    return transformer;
}
