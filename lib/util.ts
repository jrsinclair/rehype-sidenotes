import { matches, select, selectAll } from 'hast-util-select';
import type { Element, Nodes, Root, ElementContent, RootContent } from 'hast';
import { h } from 'hastscript';

//
// Constants
// ------------------------------------------------------------------------------------------------

const BLOCK_ELEMENTS =
    `address,article,aside,blockquote,canvas,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,hr,li,main,nav,noscript,ol,output,p,pre,section,table,tfoot,ul,video`.split(
        ',',
    );

const LOGICAL_SECTION_ELEMENTS = ['div', 'section', 'article', 'main'];

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

const elDepth = (el: Root | ElementContent | RootContent, currentDepth = 0): number => {
    if (el.type !== 'element' && el.type !== 'root') return currentDepth + 1;
    if (el.children.length === 0) return currentDepth + 1;
    return Math.max(...el.children.map((child) => elDepth(child, currentDepth + 1)));
};

const depthSortHelper = (a: Element, b: Element) => {
    return elDepth(a) - elDepth(b);
};

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
    const idValid = /fn[-\:]\d+$/.test(id);
    const hasParent =
        select(`[data-footnotes] [id="${id}"], .footnotes [id="${id}"]`, tree) != undefined;
    const hasRef = select(`[href="#${id}"]`, tree) != undefined;
    return idValid && hasParent && hasRef;
}

function wrapInner(toBeWrapped: ElementContent, wrapper: Element) {
    if (toBeWrapped.type !== 'element') return toBeWrapped;
    return h(toBeWrapped.tagName, toBeWrapped.properties, [
        h(wrapper.tagName, wrapper.properties, [...toBeWrapped.children]),
    ]);
}

function removeStartAndEndWhitespace(el: Element) {
    const newChildren = el.children.filter((child, idx) => {
        if (child.type !== 'text') return true;
        if (idx != 0 && idx != el.children.length - 1) return true;
        return !child.value.match(/^\s+$/);
    });
    return h(el.tagName, el.properties, newChildren);
}

/**
 * Convert Footnote to Sidenote.
 *
 * Given a footnote element, create a new sidenote element.
 *
 * @param footnoteEl The footnote element to convert to a sidenote.
 * @param fnNum The number of the footnote.
 * @returns A new HAST element.
 */
export function convertFootnoteToSidenote(footnoteEl: Element, fnNum: string) {
    const trimmedFn = removeStartAndEndWhitespace(footnoteEl);
    const chilluns = !isElement(trimmedFn.children[0])
        ? ([h('p')] as ElementContent[]).concat(trimmedFn.children)
        : trimmedFn.children;
    const firstChild = chilluns[0] as Element;
    firstChild.children.unshift(h('sup', { class: 'Sidenote-number' }, fnNum + '\u2009'));
    return h(
        'aside.Sidenote',
        { ...footnoteEl.properties, role: 'doc-footnote' },
        chilluns.map((child) => wrapInner(child, h('small', { class: 'Sidenote-small' }, []))),
    );
}

export function findLogicalSectionParent(
    fnRefId: string,
    tree: Root | Element,
): Element | undefined {
    const sectionCandidateSelector = LOGICAL_SECTION_ELEMENTS.map(
        (tagName) => `${tagName}:has(#${fnRefId})`,
    ).join(', ');
    const sectionCandidates = selectAll(sectionCandidateSelector, tree).sort(depthSortHelper);
    return sectionCandidates[0];
}

export function findFlowParent(fnRefId: string, section: Root | Element): Element | undefined {
    return (
        section.children.filter((child): child is Element => child.type === 'element') as Element[]
    ).find((child) => matches(`:has(#${fnRefId})`, child));
}
