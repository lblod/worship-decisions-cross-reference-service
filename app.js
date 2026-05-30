import { app } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import {
  getReferredDecisionType,
  getRelatedToActiveCKB,
  getEenheidForDecision,
  getOrganisationType,
  prepareQuery,
  isCKB,
  isGemeente,
  isDecisionTypeFromCKB,
  isCkbRelevantForDecisionType,
  prepareCKBSearchQuery
} from './query-utils';
import { referrerOrganisation } from './middlewares.js';
import { invalidDecisionTypeError, sendTurtleResponse } from './utils.js';

const BYPASS_HOP_CENTRAAL_BESTUUR = process.env.BYPASS_HOP_CENTRAAL_BESTUUR || false;

app.use(referrerOrganisation);

app.get('/hello', function (req, res) {
  res.send('Hello from worship-decisions-cross-reference-service');
});

app.get('/search-documents', async function (req, res) {
  try {
    const referrerDecisionType = req.query.forDecisionType;
    const referredOrganisation = req.query.forEenheid;

    if (!referrerDecisionType || !referredOrganisation) {
      return res.status(400).json({
        error: "Missing required query parameters. Please provide 'forDecisionType' and 'forEenheid'."
      });
    }

    const referrerOrganisation = req.referrerOrganisation;
    const referrerOrgType = await getOrganisationType(referrerOrganisation);
    const referredOrgType = await getOrganisationType(referredOrganisation);

    let query;

    if (await isCKB(referrerOrganisation)) {
      const relatedDecisionType = await getReferredDecisionType(referrerDecisionType, referrerOrgType, referredOrgType);

      if (!relatedDecisionType) {
        return invalidDecisionTypeError(res, referrerDecisionType);
      }

      query = prepareCKBSearchQuery(referrerOrganisation, referredOrganisation, relatedDecisionType);
    } else {
      // Check if it is relevant to fetch the CKB related to the submission based on decision type
      const isCkbRelevant = await isCkbRelevantForDecisionType(referrerDecisionType);
      let ckbUri, decisionType;

      if (isCkbRelevant) {
        // Figure out to what CKB the administrative unit is related to
        ckbUri = await getRelatedToActiveCKB(referredOrganisation);
        if (BYPASS_HOP_CENTRAAL_BESTUUR) {
          console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
          ckbUri = undefined;
        }
        const ckbType = await getOrganisationType(ckbUri);
        decisionType = await getReferredDecisionType(referrerDecisionType, referrerOrgType, ckbType);
      } else {
        decisionType = await getReferredDecisionType(referrerDecisionType, referrerOrgType, referredOrgType);
      }

      if (!decisionType) {
        return invalidDecisionTypeError(res, referrerDecisionType);
      }

      query = prepareQuery(referrerOrganisation, referredOrganisation, ckbUri, decisionType);
    }

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/document-information', async function (req, res) {
  try {
    const referrerDecisionType = req.query.forDecisionType;
    const forDecision = req.query.forRelatedDecision;
    const eenheid = await getEenheidForDecision(forDecision);

    const isLoggedInAsGemeente = await isGemeente(req.referrerOrganisation);
    const isSubmissionSentByCKB = await isDecisionTypeFromCKB(referrerDecisionType);

    let ckbUri;
    let decisionType;

    /*
      When logged in as a municipality and opening a submission sent by that municipality, we need extra info on whether
      a CKB exists between the EB and the municipality to pick the correct mapping and triples.

      We exclude the case where, when logged in as a municipality, the user opens a submission that the municipality can
      view BUT that has been submitted by a different administrative units (in practice, it will always be a CKB).
    */
    if (isLoggedInAsGemeente && !isSubmissionSentByCKB) {
        if (forDecision && !referrerDecisionType) {
        return res.status(400).json({
          error: `Missing required query parameters. Both "forDecision" and "forDecisionType" are required.`
        });
      }

      const isCkbRelevant = await isCkbRelevantForDecisionType(referrerDecisionType);

      if (isCkbRelevant) {
        // Figure out whether the administrative unit is related to a CKB or is a CKB itself
        ckbUri = await isCKB(eenheid) ? eenheid : await getRelatedToActiveCKB(eenheid);

        if (BYPASS_HOP_CENTRAAL_BESTUUR) {
          console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
          ckbUri = null;
        }
      }

      decisionType = await getReferredDecisionType(referrerDecisionType, !!ckbUri);
    }

    const query = prepareQuery(undefined, forDecision, ckbUri, decisionType);

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
