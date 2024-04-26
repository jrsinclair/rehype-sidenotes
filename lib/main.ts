import type { Element, Nodes, ElementContent, Root, RootContent } from 'hast';
import { select, selectAll } from 'hast-util-select';
import { h } from 'hastscript';

const BLOCK_ELEMENTS =
    `address,article,aside,blockquote,canvas,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,hr,li,main,nav,noscript,ol,output,p,pre,section,table,tfoot,ul,video`.split(
        ',',
    );

export function isValidFootnote(el: Element, tree: Nodes) {
    const id = `${el.properties['id']}`;
    const idValid = /fn-\d+$/.test(id);
    const hasParent = select(`[data-footnotes] #${id}`, tree) != undefined;
    const hasRef = select(`[href="#${id}"]`, tree) != undefined;
    return idValid && hasParent && hasRef;
}

const isElement = (el: ElementContent | RootContent | undefined): el is Element =>
    el != undefined && el.type === 'element';

export function convertFootnoteToSidenote(el: Element, fnNum: string) {
    if (!isElement(el.children[0])) {
        el.children.unshift(h('p'));
    }
    const firstChild = el.children[0] as Element;
    firstChild.children.unshift(h('sup', { class: 'Sidenote-number' }, fnNum + '\u2009'));
    return h('aside.Sidenote', el.properties, el.children);
}

function findBlockParent(selector: string, tree: Root | Element) {
    const parentSelector = `*:has(> ${selector})`;
    const candidate = select(parentSelector, tree);
    if (candidate === undefined) return;
    if (candidate === tree) return tree;
    if (BLOCK_ELEMENTS.includes(candidate.tagName)) return candidate;
    return findBlockParent(parentSelector, tree);
}

const findRef = (fn: Element, tree: Root | Element) => {
    const fnId = `${fn.properties.id}`;
    return select(`[href="#${fnId}"]`, tree);
};

export function findParentBlockElementOfRef(fn: Element, tree: Root | Element) {
    const fnLink = findRef(fn, tree);
    const fnLinkId = fnLink?.properties.id;
    return findBlockParent(`#${fnLinkId}`, tree);
}

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
    const ref = findRef(el, tree);
    if (!ref) return;
    const sidenote = convertFootnoteToSidenote(el, extractText(ref));
    const parent = findParentBlockElementOfRef(el, tree);
    if (parent === undefined) return;
    const parentOfParent = findParentOfEl(parent, tree);
    if (parentOfParent === undefined) return;
    const idx = parentOfParent.children.indexOf(parent);
    parentOfParent.children.splice(idx + 1, 0, { type: 'text', value: '\n ' }, sidenote);
    removeEl(el, tree);
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

export default function rehypeSidenotes() {
    return transformer;
}
