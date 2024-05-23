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
    const forDecisionType = req.query.forDecisionType;
    const forEenheid = req.query.forEenheid;
    const forDecision = req.query.forRelatedDecision;

    // If forDecision is not provided, forDecisionType and forEenheid become mandatory.
    if (!forDecision && (!forEenheid || !forEenheid)) {
      return res.status(400).json({
        error: "Missing required query parameters. Please provide 'forDecisionType' and 'forEenheid'."
      });
    }

    // Extract from the `mu-session-id` the bestuurseenheid the user is asking for (i.e. security measure)
    const sessionUri = req.headers['mu-session-id'];

    if (!sessionUri ) {
      return res.status(400).json({
        error: "Missing mu-session-id. This call should go through mu-identifier."
      });
    }

    // If no decision has been provided,
    //  we need to calculate extra parameters for the query, so we can provide a list of options.
    let query = '';

    if(!forDecision) {

      const fromEenheid = await bestuurseenheidForSession(sessionUri);
      if(!fromEenheid) {
        return res.status(400).json({
          error: "No eenheid found for mu-session-id. Aborting"
        });
      }

      // Figure out whether Eenheid is related to CKB
      let ckbUri = await getRelatedToCKB( forEenheid );

      // ------ Start temporary implementation
      // We currently don't support documents provided by CKB's (mainly the data is broken)
      // But we still, in development mode, want to make it easier to return some data
      if(ckbUri && process.env.NODE_ENV != 'development') {
        console.warn(`CKB ${ckbUri} found for ${forEenheid}, currently case is not supported`);
        res.set('Content-Type', 'text/turtle');
        return res.send('');
      }
      else if(process.env.NODE_ENV == 'development') {
        console.warn(`CKB ${ckbUri} found for ${forEenheid}, currently case is not supported, but in development mode, we just ignore this`);
        ckbUri = null;
      }
      // ------ End temporary implementation

      // Get decision type to request
      const decisionType = getRelatedDecisionType( forDecisionType, ckbUri );
      if(!decisionType) {
        return res.status(400).json({
          error: `No related document/decisionType found ${forDecisionType}. Aborting`
        });
      }

      query = prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionType });
    }

    else {
      query = prepareQuery({ forDecision } );
    }

    // execute query
    // TODO: Here we could add a hook to connect to vendor-API if we need to.
    const triples = (await querySudo(query))?.results?.bindings || [];
    const nTriples = triples.map(t => serializeTriple(t)) || [];

    res.set('Content-Type', 'text/turtle');
    return res.send(nTriples.join('\n'));
  }
  catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
