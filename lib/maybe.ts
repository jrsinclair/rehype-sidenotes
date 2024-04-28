type Args<A, B, C, D, E, F, G, H, I, J> =
    | []
    | [A]
    | [A, B]
    | [A, B, C]
    | [A, B, C, D]
    | [A, B, C, D, E]
    | [A, B, C, D, E, F]
    | [A, B, C, D, E, F, G]
    | [A, B, C, D, E, F, G, H]
    | [A, B, C, D, E, F, G, H, I]
    | [A, B, C, D, E, F, G, H, I, J];

/**
 * Maybe Do.
 *
 * Checks each yielded value to see if it is null or undefined. If we encounter a nullish value,
 * we stop processing and return undefined.
 *
 * @param genFn A generator function.
 * @returns The last yielded value or undefined.
 */
export const maybeDo =
    <A, B, C, D, E, F, G, H, I, J, RVal, T, Params extends Args<A, B, C, D, E, F, G, H, I, J>>(
        genFn: (...args: Params) => Generator<T, RVal>,
    ) =>
    (...args: Params) => {
        // We kick the message passing off by calling the generator function with whatever arguments
        // we've been passed.
        const generator = genFn(...args);
        // Next, we get the first yielded value from the generator.
        let next = generator.next();

        // We keep going processing values until we get a `done` response.
        do {
            // If we're done, return the value.
            if (next.done) return next.value;

            // If we encounter an empty value, then we skip all the rest and return undefined.
            if (next.value == null) return undefined;

            // If we're still here, we got a non-empty generator, so we extract the value from it
            // and pass it back to the generator function.
            next = generator.next(next.value);
        } while (!next.done);
    };
