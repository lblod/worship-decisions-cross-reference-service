import { bestuurseenheidForSession } from './query-utils.js';
import { getSessionUri } from './utils.js';

/**
 * Looks up the bestuurseenheid attached to the current session and stores in as `referrerOrganisation` on the request object.
 * If the session uri isn't found a 400 response is returned.
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 */
export async function referrerOrganisation(req, res, next) {
  const sessionUri = getSessionUri(req);

  if (!sessionUri) {
    return res.status(400).json({
      error: "Missing mu-session-id header. This call should go through mu-identifier."
    });
  }

  const referrerOrganisation = await bestuurseenheidForSession(sessionUri);

  if (!referrerOrganisation) {
    return res.status(400).json({
      error: "No eenheid found for mu-session-id. Aborting"
    });
  }

  req.referrerOrganisation = referrerOrganisation;
  next();
}
