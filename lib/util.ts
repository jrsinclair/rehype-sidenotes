import { select } from 'hast-util-select';
import type { Element, Nodes, Root, ElementContent, RootContent } from 'hast';
import { h } from 'hastscript';

//
// Constants
// ------------------------------------------------------------------------------------------------

const BLOCK_ELEMENTS =
    `address,article,aside,blockquote,canvas,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,hr,li,main,nav,noscript,ol,output,p,pre,section,table,tfoot,ul,video`.split(
        ',',
    );
//
// Private utilities
// ------------------------------------------------------------------------------------------------

/**
 * Find Block Parent.
 *
 * Given a CSS selector that (we assume) points to an inline element, search up the tree looking for
 * a block element.
 *
 * @param selector A selector that specifies where to start looking up the tree.
 * @param tree The HAST tree we're currently working with.
 * @returns The first block element parent of the provided selector we can find.
 */
function findBlockParent(selector: string, tree: Root | Element) {
    const parentSelector = `*:has(> ${selector})`;
    const candidate = select(parentSelector, tree);

    // If our search found nothing, no further searches will help us.
    if (candidate === undefined) return;

    // If we found something, and it's a block element, then we've found it!
    if (BLOCK_ELEMENTS.includes(candidate.tagName)) return candidate;

    // If we found something and it's NOT a block element, but we're at the top of the tree, there's
    // no point searching further because we can't go any higher.
    if (candidate === tree) return tree;

    // If we've reached here, we found an inline element. So we look one level further up the tree.
    return findBlockParent(parentSelector, tree);
}

//
// Exported functions
// ------------------------------------------------------------------------------------------------

/**
 * Find footnote reference.
 *
 * Locates the first link element in the tree that points to the given footnote.
 *
 * @param fn Footnote element to find the reference for.
 * @param tree A HAST tree to search in.
 * @returns The first footnote reference pointing to the given footnote.
 */
export const findRef = (fn: Element, tree: Root | Element) => {
    const fnId = `${fn.properties.id}`;
    return select(`[href="#${fnId}"]`, tree);
};

/**
 * Is the given node an element?
 *
 * @param node The node to test.
 * @returns True if the given node is an element.
 */
export const isElement = (node: ElementContent | RootContent | undefined): node is Element =>
    node != undefined && node.type === 'element';

/**
 * Is this a valid footnote element?
 *
 * @param el The HAST element to test
 * @param tree The HAST tree we're currently manipulating.
 * @returns True if this is a footnote with a valid ID, and a reference pointing to it, and is
 *          located in the footnotes section.
 */
export function isValidFootnote(el: Element, tree: Nodes) {
    const id = `${el.properties['id']}`;
    const idValid = /fn-\d+$/.test(id);
    const hasParent = select(`[data-footnotes] #${id}`, tree) != undefined;
    const hasRef = select(`[href="#${id}"]`, tree) != undefined;
    return idValid && hasParent && hasRef;
}

function wrapInner(toBeWrapped: ElementContent, wrapper: Element) {
    if (toBeWrapped.type !== 'element') return toBeWrapped;
    return h(toBeWrapped.tagName, toBeWrapped.properties, [
        h(wrapper.tagName, wrapper.properties, [...toBeWrapped.children]),
    ]);
}

/**
 * Convert Footnote to Sidenote.
 *
 * Given a footnote element, create a new sidenote element.
 *
 * @param el The footnote element to convert to a sidenote.
 * @param fnNum The number of the footnote.
 * @returns A new HAST element.
 */
export function convertFootnoteToSidenote(el: Element, fnNum: string) {
    const chilluns = !isElement(el.children[0])
        ? ([h('p')] as ElementContent[]).concat(el.children)
        : el.children;
    const firstChild = chilluns[0] as Element;
    firstChild.children.unshift(h('sup', { class: 'Sidenote-number' }, fnNum + '\u2009'));
    return h(
        'aside.Sidenote',
        el.properties,
        chilluns.map((child) => wrapInner(child, h('small', { class: 'Sidenote-small' }, []))),
    );
}

/**
 * Find Parent Block Element of Reference.
 *
 * Given a footnote element, find the reference that points to it. Then go up the
 * tree until we find a block element.
 *
 * @param fn The footnote element to look up.
 * @param tree The HAST tree we're currently working in.
 * @returns The parent element of the reference that points to the given footnote.
 */
export function findParentBlockElementOfRef(fn: Element, tree: Root | Element) {
    const fnLink = findRef(fn, tree);
    const fnLinkId = fnLink?.properties.id;
    return findBlockParent(`#${fnLinkId}`, tree);
}
