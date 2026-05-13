// Zod request-validation middleware. Pass a schema object with any of
// `body`, `query`, `params`. Validates every segment and accumulates issues
// across all of them, then throws a single combined ZodError (with paths
// prefixed by segment) so the global error handler can surface field-level
// errors in one response.
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodSchema, type ZodIssue } from 'zod';

export interface RequestSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

type Segment = 'body' | 'query' | 'params';

function tryParseSegment<T>(
  segment: Segment,
  schema: ZodSchema<T> | undefined,
  value: unknown,
): { issues: ZodIssue[]; data?: T } {
  if (!schema) return { issues: [] };
  const result = schema.safeParse(value);
  if (result.success) return { issues: [], data: result.data };
  return {
    issues: result.error.issues.map((i) => ({
      ...i,
      path: [segment, ...i.path],
    })),
  };
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const bodyR = tryParseSegment('body', schemas.body, req.body);
    const queryR = tryParseSegment('query', schemas.query, req.query);
    const paramsR = tryParseSegment('params', schemas.params, req.params);

    const allIssues = [...bodyR.issues, ...queryR.issues, ...paramsR.issues];
    if (allIssues.length > 0) {
      next(new ZodError(allIssues));
      return;
    }

    if (bodyR.data !== undefined) req.body = bodyR.data;
    if (queryR.data !== undefined) (req as { query: unknown }).query = queryR.data;
    if (paramsR.data !== undefined) (req as { params: unknown }).params = paramsR.data;
    next();
  };
}
