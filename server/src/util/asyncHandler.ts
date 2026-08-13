import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Express 4 does not catch rejections thrown inside async handlers — an unhandled
 * rejection there crashes the whole process (Node 15+ default), taking every other
 * request down with it. This routes the error to Express's error middleware instead.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next)
  }
}
