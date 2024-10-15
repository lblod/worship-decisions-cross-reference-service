import { app } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { bestuurseenheidForSession, getRelatedToCKB, getEenheidForDecision, getRelatedDecisionType, prepareQuery } from './query-utils';
import { sessionUri } from './middlewares.js';
import { sendTurtleResponse } from './utils.js';

const BYPASS_HOP_CENTRAAL_BESTUUR = process.env.BYPASS_HOP_CENTRAAL_BESTUUR || false;

app.use(sessionUri);

app.get('/hello', function (req, res) {
  res.send('Hello from worship-decisions-cross-reference-service');
});

// TODO: Remove this handler once we create a new release that contains the other route handles as well.
app.get('/related-document-information', async function (req, res) {
  try {
    // Get the related decisions for specific type & bestuurseenheid provided in the query parameters `?forDecisionType=..&?forEenheid=...
    const forDecisionType = req.query.forDecisionType;
    const forEenheid = req.query.forEenheid;
    const forDecision = req.query.forRelatedDecision;

    if (!forDecision && (!forDecisionType || !forEenheid)) {
      return res.status(400).json({
        error: "Missing required query parameters. Please provide 'forDecisionType' and 'forEenheid'."
      });
    }

    if (forDecision && !forDecisionType) {
      return res.status(400).json({
        error: `Missing required query parameters.
                If forDecision is provided, we expect forDecisionType too.`
      });
    }

    // If no decision has been provided,
    //  we need to calculate extra parameters for the query, so we can provide a list of options.
    let query = '';

    if (!forDecision) {

      const fromEenheid = await bestuurseenheidForSession(req.sessionUri);

      if (!fromEenheid) {
        return res.status(400).json({
          error: "No eenheid found for mu-session-id. Aborting"
        });
      }

      // Figure out whether Eenheid is related to CKB
      let ckbUri = await getRelatedToCKB(forEenheid);

      if (BYPASS_HOP_CENTRAAL_BESTUUR) {
        console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
        ckbUri = null;
      }

      // Get decision type to request
      const decisionTypeData = getRelatedDecisionType(forDecisionType, ckbUri);

      if (!decisionTypeData.decisionType) {
        return res.status(400).json({
          error: `No related document/decisionType found ${forDecisionType}. Aborting`
        });
      }

      query = prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionTypeData });
    }

    else {
      const eenheid = await getEenheidForDecision(forDecision);
      let ckbUri = await getRelatedToCKB(eenheid);

      if (BYPASS_HOP_CENTRAAL_BESTUUR) {
        console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
        ckbUri = null;
      }

      const decisionTypeData = getRelatedDecisionType(forDecisionType, ckbUri);

      query = prepareQuery({ forDecision, ckbUri, decisionTypeData });
    }

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  }
  catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/search-documents', async function (req, res) {
  try {
    // Get the related decisions for specific type & bestuurseenheid provided in the query parameters `?forDecisionType=..&?forEenheid=...
    const forDecisionType = req.query.forDecisionType;
    const forEenheid = req.query.forEenheid;

    if (!forDecisionType || !forEenheid) {
      return res.status(400).json({
        error: "Missing required query parameters. Please provide 'forDecisionType' and 'forEenheid'."
      });
    }

    const fromEenheid = await bestuurseenheidForSession(req.sessionUri);
    if (!fromEenheid) {
      return res.status(400).json({
        error: "No eenheid found for mu-session-id. Aborting"
      });
    }

    // Figure out whether Eenheid is related to CKB
    let ckbUri = await getRelatedToCKB(forEenheid);

    if (BYPASS_HOP_CENTRAAL_BESTUUR) {
      console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
      ckbUri = null;
    }

    // Get decision type to request
    const decisionTypeData = getRelatedDecisionType(forDecisionType, ckbUri);

    if (!decisionTypeData.decisionType) {
      return res.status(400).json({
        error: `No related document/decisionType found ${forDecisionType}. Aborting`
      });
    }

    const query = prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionTypeData });

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  }
  catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/document-information', async function (req, res) {
  try {
    const forDecisionType = req.query.forDecisionType;
    const forDecision = req.query.forRelatedDecision;

    if (forDecision && !forDecisionType) {
      return res.status(400).json({
        error: `Missing required query parameters. Both "forDecision" and "forDecisionType" are required.`
      });
    }

    const eenheid = await getEenheidForDecision(forDecision);
    let ckbUri = await getRelatedToCKB(eenheid);

    if (BYPASS_HOP_CENTRAAL_BESTUUR) {
      console.warn(`Skipping extra hop centraal bestuur. This should only be used in development mode.`);
      ckbUri = null;
    }

    const decisionTypeData = getRelatedDecisionType(forDecisionType, ckbUri);

    const query = prepareQuery({ forDecision, ckbUri, decisionTypeData });

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    return sendTurtleResponse(res, triples);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

