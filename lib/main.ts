import type { Element, ElementContent, Root } from 'hast';
import { select, selectAll } from 'hast-util-select';
import {
    isValidFootnote,
    convertFootnoteToSidenote,
    findParentBlockElementOfRef,
    isElement,
    findRef,
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

const extractText = (el: Element): string => {
    return el.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
};

function removeEl(el: Element, tree: Root) {
    const parent = findParentOfEl(el, tree);
    if (!parent) return;
    const idx = parent?.children.indexOf(el);
    if (idx === -1) return;
    parent.children.splice(idx, 1);
}

function visitAndUpdate(el: Element, tree: Root) {
    if (!isValidFootnote(el, tree)) return;
    const footnoteReference = findRef(el, tree);
    (footnoteReference ? [footnoteReference] : [])
        .flatMap((ref) => {
            const sidenote = convertFootnoteToSidenote(el, extractText(ref));
            return sidenote ? [{ sidenote }] : [];
        })
        .flatMap(({ sidenote }) => {
            const parent = findParentBlockElementOfRef(el, tree);
            return parent ? [{ sidenote, parent }] : [];
        })
        .flatMap(({ sidenote, parent }) => {
            const parentOfParent = findParentOfEl(parent, tree);
            return parentOfParent ? [{ sidenote, parent, parentOfParent }] : [];
        })
        .map(({ parentOfParent, sidenote, parent }) => ({
            idx: parentOfParent.children.indexOf(parent),
            parentOfParent,
            sidenote,
        }))
        .forEach(({ idx, parentOfParent, sidenote }) => {
            parentOfParent.children.splice(idx + 1, 0, { type: 'text', value: '\n ' }, sidenote);
            removeEl(el, tree);
        });
}

function transformer(tree: Root) {
    // Grab all list items below the element with data attribute footnotes
    const listItems = selectAll('[data-footnotes] li', tree);
    listItems.forEach((el) => visitAndUpdate(el, tree));
    const remainingListItems = selectAll('[data-footnotes] li', tree);
    if (remainingListItems.length === 0) {
        const fnSection = select('[data-footnotes]', tree);
        if (fnSection) removeEl(fnSection, tree);
    }
    return tree;
}

export default function sidenotes() {
    return transformer;
}
