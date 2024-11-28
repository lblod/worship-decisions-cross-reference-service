import { app } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import {
  getRelatedToCKB,
  getEenheidForDecision,
  getRelatedDecisionType,
  prepareQuery,
  isCKB,
  isGemeente,
  isDecisionTypeFromCKB,
  ckbDecisionTypeToRelatedType,
  prepareCKBSearchQuery
} from './query-utils';
import { fromEenheid } from './middlewares.js';
import { invalidDecisionTypeError, sendTurtleResponse } from './utils.js';

const BYPASS_HOP_CENTRAAL_BESTUUR = process.env.BYPASS_HOP_CENTRAAL_BESTUUR || false;

app.use(fromEenheid);

app.get('/hello', function (req, res) {
  res.send('Hello from worship-decisions-cross-reference-service');
});

app.get('/search-documents', async function (req, res) {
  try {
    const forDecisionType = req.query.forDecisionType;
    const forEenheid = req.query.forEenheid;

    if (!forDecisionType || !forEenheid) {
      return res.status(400).json({
        error: "Missing required query parameters. Please provide 'forDecisionType' and 'forEenheid'."
      });
    }

    const fromEenheid = req.fromEenheid;
    let query;

    if (await isCKB(fromEenheid)) {
      const relatedDecisionType = ckbDecisionTypeToRelatedType(forDecisionType);

      if (!relatedDecisionType) {
        return invalidDecisionTypeError(res, forDecisionType);
      }

      query = prepareCKBSearchQuery({ fromEenheid, forEenheid, decisionType: relatedDecisionType });
    } else {
      // Figure out whether Eenheid is related to CKB
      let ckbUri = await getRelatedToCKB(forEenheid);

      if (BYPASS_HOP_CENTRAAL_BESTUUR) {
        console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
        ckbUri = null;
      }

      // Get decision type to request
      const decisionTypeData = getRelatedDecisionType(forDecisionType, ckbUri);

      if (!decisionTypeData.decisionType) {
        return invalidDecisionTypeError(res, forDecisionType);
      }

      query = prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionTypeData });
    }

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/document-information', async function (req, res) {
  try {
    const forDecisionType = req.query.forDecisionType;
    const forDecision = req.query.forRelatedDecision;
    const eenheid = await getEenheidForDecision(forDecision);

    const isLoggedInAsGemeente = await isGemeente(req.fromEenheid);
    const isSubmissionSentByCKB = isDecisionTypeFromCKB(forDecisionType);

    let ckbUri;
    let decisionTypeData;

    /*
      When logged in as a municipality and opening a submission sent by that municipality, we need extra info on whether
      a CKB exists between the EB and the municipality to pick the correct mapping and triples.

      We exclude the case where, when logged in as a municipality, the user opens a submission that the municipality can
      view BUT that has been submitted by a different administrative units (in practice, it will always be a CKB).
    */
    if (isLoggedInAsGemeente && !isSubmissionSentByCKB) {
        if (forDecision && !forDecisionType) {
        return res.status(400).json({
          error: `Missing required query parameters. Both "forDecision" and "forDecisionType" are required.`
        });
      }

      ckbUri = await getRelatedToCKB(eenheid);

      if (BYPASS_HOP_CENTRAAL_BESTUUR) {
        console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
        ckbUri = null;
      }

      decisionTypeData = getRelatedDecisionType(forDecisionType, ckbUri);
    }

    const query = prepareQuery({ forDecision, ckbUri, decisionTypeData });

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
