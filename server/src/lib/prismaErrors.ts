/**
 * Narrowing Prisma's constraint errors — in both shapes it reports them.
 *
 * `P2002` is "unique constraint failed", but acting on the code alone is too
 * blunt: a route that recovers from a duplicate case number must not also
 * swallow a duplicate on some unrelated column. So the column has to be part
 * of the test, and finding the column is the awkward part.
 *
 * Classic Prisma puts it in `meta.target`, sometimes a string and sometimes an
 * array. Prisma 7 with a driver adapter — which is what this server runs, via
 * PrismaPg — does not populate `meta.target` at all. It nests the driver's own
 * report instead:
 *
 *   meta.driverAdapterError.cause.constraint.fields = ['"userId"', '"caseNumber"']
 *
 * quotes included. A predicate written against `meta.target` therefore returns
 * false for every error this server will ever actually see, and the "recovery"
 * built on it is dead code that looks alive. That is how the /next race
 * survived its first fix: the handler was correct and the guard in front of it
 * never once matched.
 *
 * So gather every place the column might be named, quotes and constraint names
 * and the raw driver message included, and match a substring against all of
 * them.
 */
function constraintNames(err: unknown): string[] {
  const e = err as {
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: {
          constraint?: { fields?: unknown[]; index?: unknown };
          originalMessage?: unknown;
        };
      };
    };
  };

  const found: string[] = [];

  const target = e?.meta?.target;
  if (Array.isArray(target)) found.push(...target.map(String));
  else if (target != null) found.push(String(target));

  const cause = e?.meta?.driverAdapterError?.cause;
  if (Array.isArray(cause?.constraint?.fields)) found.push(...cause.constraint.fields.map(String));
  if (cause?.constraint?.index != null) found.push(String(cause.constraint.index));
  if (typeof cause?.originalMessage === 'string') found.push(cause.originalMessage);

  return found;
}

/** A unique-constraint failure that involves `field`. */
export function isUniqueViolation(err: unknown, field: string): boolean {
  if ((err as { code?: string })?.code !== 'P2002') return false;
  return constraintNames(err).some((name) => name.includes(field));
}

/** A foreign-key failure: the row this one points at is gone. */
export function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2003';
}
