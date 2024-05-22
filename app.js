import { app } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { serializeTriple } from './utils';
import { bestuurseenheidForSession, getRelatedToCKB, getRelatedDecisionType, prepareQuery } from './query-utils';

app.get('/hello', function( req, res ) {
  res.send('Hello from worship-decisions-cross-reference-service');
} );

app.get('/related-document-information', async function( req, res ) {
  try {
    // Get the related decisions for specific type & bestuurseenheid provided in the query parameters `?forDecisionType=..&?forEenheid=...
    const decisionType = req.query.forDecisionType;
    const forEenheidUri = req.query.forEenheid;

    //TODO add ?forDecision

    // Check if both required parameters are provided
    if (!decisionType || !forEenheidUri) {
      return res.status(400).json({
        error: "Missing required query parameters. Please provide 'forDecisionType' and 'forEenheid'."
      });
    }

    // extract from the `mu-session-id` the bestuurseenheid the user is asking for (i.e. security measure)
    const sessionUri = req.headers['mu-session-id'];

    if (!sessionUri ) {
      return res.status(400).json({
        error: "Missing mu-session-id. This call should go through mu-identifier."
      });
    }

    const fromEenheidUri = await bestuurseenheidForSession(sessionUri);
    if(!fromEenheidUri) {
      return res.status(400).json({
        error: "No eenheid found for mu-session-id. Aborting"
      });
    }

    // Figure out whether Eenheid is related to CKB
    const ckbUri = await getRelatedToCKB( forEenheidUri );

    // Get decision type to request
    const relatedDecisionType = getRelatedDecisionType( decisionType, ckbUri );

    const query = prepareQuery(fromEenheidUri, forEenheidUri, ckbUri, relatedDecisionType );

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we want.
    const triples = (await querySudo(query))?.results?.bindings || [];
    const nTriples = triples.map(t => serializeTriple(t)) || [];

    res.set('Content-Type', 'text/turtle');
    return res.send(nTriples.join('\n'));
  }
  catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


/*
 * Utils
 */
