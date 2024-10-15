/**
 * Looks up the mu session uri and adds it as a property to the request object.
 * If the session uri isn't found a 400 response is returned.
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 */
export function sessionUri(req, res, next) {
  const sessionUri = req.headers['mu-session-id'];

  if (!sessionUri) {
    return res.status(400).json({
      error: "Missing mu-session-id header. This call should go through mu-identifier."
    });
  }

  req.sessionUri = sessionUri;
  next();
}