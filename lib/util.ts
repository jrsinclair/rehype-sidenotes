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

const LOGICAL_SECTION_ELEMENTS = ['div', 'section', 'article', 'main'] as const;

//
// Private utilities
// ------------------------------------------------------------------------------------------------

/**
 * Element depth.
 *
 * Calculate how deeply an element's children are nested.
 *
 * @param el An element to calculate depth for.
 * @param currentDepth Number used to keep track of how far we've already traversed.
 * @returns The depth of children below the current element.
 */
const elDepth = (el: Root | ElementContent | RootContent, currentDepth = 0): number => {
    if (el.type !== 'element' && el.type !== 'root') return currentDepth + 1;
    if (el.children.length === 0) return currentDepth + 1;
    return Math.max(...el.children.map((child) => elDepth(child, currentDepth + 1)));
};

/**
 * Depth sort helper.
 *
 * A utility for sorting elements by how deep the tree below them goes.
 *
 * @param a First element to compare.
 * @param b Second element to compare.
 * @returns A comparison between the two elements.
 */
const depthSortHelper = (a: Element, b: Element) => {
    return elDepth(a) - elDepth(b);
};

/**
 * Is the given node an element?
 *
 * @param node The node to test.
 * @returns True if the given node is an element.
 */
const isElement = (node: ElementContent | RootContent | undefined): node is Element =>
    node != undefined && node.type === 'element';

/**
 * Wrap Inner.
 *
 * Given an inner element and a wrapper-specification, wrap the children of the inner element with
 * a new element as specified.
 * @param toBeWrapped An element to be wrapped with the wrapper element.
 * @param wrapper Specification for an element to be wrapped around the inner element. Its children
 *                will be ignored.
 * @returns A new element that is like the inner element, but with its children wrapped according
 *          to the wrapper-specification.
 */
function wrapInner(toBeWrapped: ElementContent, wrapper: Element) {
    if (toBeWrapped.type !== 'element') return toBeWrapped;
    return h(toBeWrapped.tagName, toBeWrapped.properties, [
        h(wrapper.tagName, wrapper.properties, [...toBeWrapped.children]),
    ]);
}

/**
 * Remove start and end whitespace from an element.
 *
 * @param el An element to trim whitespace from.
 * @returns A new element with whitespace trimmed.
 */
function removeStartAndEndWhitespace(el: Element) {
    // Filtering isn't particularly efficient, but it gets the job done.
    const newChildren = el.children.filter((child, idx) => {
        if (child.type !== 'text') return true;
        if (idx != 0 && idx != el.children.length - 1) return true;
        return !child.value.match(/^\s+$/);
    });
    return h(el.tagName, el.properties, newChildren);
}

/**
 * Find parent of element.
 *
 * Does a depth-first recursive search of the tree to find the parent of the given element.
 *
 * @param el The element to find the parent of.
 * @param tree The tree to search for the parent in (el must be a descendant of this root element).
 * @returns Either the parent of the element, or undefined.
 */
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
    const ret = select(`[href="#${fnId}"]`, tree);
    if (ret === undefined) {
        console.warn(
            `Failed to find matching footnote reference for #${fnId} using selector [href="#${fnId}"]`,
        );
    }
    return ret;
};

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
    return h('aside.Sidenote', { ...footnoteEl.properties, role: 'doc-footnote' }, [
        '\n ',
        ...chilluns.map((child) => wrapInner(child, h('small', { class: 'Sidenote-small' }, []))),
        '\n ',
    ]);
}

/**
 * Find logical section parent.
 *
 * Given the ID of an element, find the closest ancestor element that is a logical section. Here,
 * by 'logical section', we mean a div, section, article or main element. If we can't find one of
 * those, we will return the root of the tree.
 *
 * We use this to determine where to insert a footnote in the flow of an article or page.
 *
 * @param idOfEl The ID of the element to locate the logical section parent for.
 * @param tree The tree to search for the parent in.
 * @returns The closest anscestor div, section, article, or main element for the element with the
 *          given ID.
 */
export function findLogicalSectionParent(
    idOfEl: string,
    tree: Root | Element,
): Element | Root | undefined {
    const sectionCandidateSelector = LOGICAL_SECTION_ELEMENTS.map(
        (tagName) => `${tagName}:has([id="${idOfEl}"])`,
    ).join(', ');
    const sectionCandidates = selectAll(sectionCandidateSelector, tree).sort(depthSortHelper);
    if (sectionCandidates.length === 0 && tree.type === 'root') return tree;
    if (sectionCandidates.length === 0) {
        console.warn(
            `Failed to find logical section parent with selector: ${sectionCandidateSelector}`,
        );
    }
    return sectionCandidates[0];
}

/**
 * Find flow parent.
 *
 * Given the ID of an element, find an element immediately below `section` that contains the
 * given ID element.
 *
 * We use this to determine where to insert a footnote in the flow of an article or page.
 *
 * @param idOfEl ID of the element to find an ancestor for within the section.
 * @param section The section to search.
 * @returns The element directly below `section` that contains the element with ID `idOfEl`.
 */
export function findFlowParent(idOfEl: string, section: Root | Element): Element | undefined {
    const selector = BLOCK_ELEMENTS.map((tag) => `${tag}:has([id="${idOfEl}"])`).join(', ');
    return (section.children.filter(isElement) as Element[]).find((child) =>
        matches(selector, child),
    );
}

/**
 * Get Text.
 *
 * Extracts all the text nodes below the given element and concatenates them.
 *
 * @param el The element to extract text from.
 * @returns The concatenation of all the text nodes below the current element.
 */
export const getText = (el: ElementContent): string => {
    if (el.type === 'text') return el.value;
    if (el.type === 'comment') return '';
    return el.children.map(getText).join('');
};

/**
 * Remove Element.
 *
 * Removes an element from the tree.
 *
 * @param el An element to remove from the tree.
 * @param tree The tree to remove an element from.
 * @returns The removed element or undefined.
 */
export function removeEl(el: Element, tree: Root) {
    const parent = findParentOfEl(el, tree);
    if (!parent) return;
    const idx = parent?.children.indexOf(el);
    if (idx === -1) return;
    return parent.children.splice(idx, 1)[0] as Element;
}
