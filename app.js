import { app } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { serializeTriple } from './utils';

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

export async function bestuurseenheidForSession( sessionUri ) {
  const queryStr = `

     PREFIX besluit:  <http://data.vlaanderen.be/ns/besluit#>
     PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
     PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

     SELECT DISTINCT ?bestuurseenheid ?uuid
     WHERE {
       ${sparqlEscapeUri(sessionUri)} ext:sessionGroup ?bestuurseenheid.
       ?bestuurseenheid a besluit:Bestuurseenheid;
         mu:uuid ?uuid.
     }
     LIMIT 1
  `;

  let result = await querySudo(queryStr);

  if(result.results.bindings.length == 1) {
    return result.results.bindings[0].bestuurseenheid.value;
  }
  else {
    throw `Unexpected result fetching bestuurseenheid from session ${sessionUri}`;
  }
}

async function getRelatedToCKB( eenheidUri ) {
  // Query the database with query
  // if not found return null else the URI
    return null; // or the CKB URI
}

function getRelatedDecisionType( decisionType, hasCKB ) {
  // TODO: wrap up the table once we have the full spec.
  if(hasCKB) {
    const mappingTable = {
      // Advies bij jaarrekening eredienstbestuur
      "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
        // Gezamenlijk indienen van de jaarrekeningen van de besturen van de eredienst door het centraal bestuur van de eredienst.
      "https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461"
    };
    return mappingTable[decisionType];
  }
  else {
    const mappingTable = {
      // Advies bij jaarrekening eredienstbestuur
      "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
        // Jaarrekening.
      "https://data.vlaanderen.be/id/concept/BesluitType/e44c535d-4339-4d15-bdbf-d4be6046de2c"
    };
    return mappingTable[decisionType];
  }
}

function prepareQuery(fromEenheid, forEenheid, ckbUri, decisionType ) {
  let query;
  if(ckbUri) {
    query = ''; // specific query needed for eenheid with CBK
  }
  else {
    query = `

      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov: <http://www.w3.org/ns/prov#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

      CONSTRUCT {
        ?subject a besluit:Besluit, skos:Concept;
          skos:prefLabel ?displayLabel.
      }
      WHERE {
        VALUES ?eenheid {
          ${sparqlEscapeUri(fromEenheid)}
        }

        VALUES ?eredienst {
         ${sparqlEscapeUri(forEenheid)}
        }

        VALUES ?besluitType {
          ${sparqlEscapeUri(decisionType)}
        }

        ?betrokkenBestuur <http://www.w3.org/ns/org#organization> ?eredienst.
        ?eenheid <http://data.lblod.info/vocabularies/erediensten/betrokkenBestuur> ?betrokkenBestuur.

        ?submission a <http://rdf.myexperiment.org/ontologies/base/Submission>;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
          dcterms:subject ?subject;
          <http://purl.org/pav/createdBy> ?eredienst;
          prov:generated ?formData.

          ?formData
            <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime>
              |
              <http://mu.semte.ch/vocabularies/ext/sessionStartedAtTime>	 ?sessionStarted;

            dcterms:type ?besluitType.

          ?besluitType skos:prefLabel ?besluitTypeLabel.

          BIND(STRBEFORE(STR(?dateSent), "T") AS ?niceDateSent)
          BIND(STRBEFORE(STR(?sessionStarted), "T") AS ?niceSessionStarted)
          BIND(CONCAT(?besluitTypeLabel, "verstuurd op  ", ?niceDateSent, " voor zittingsdatum ", ?niceSessionStarted) as ?displayLabel)
      }
    `;
  }

  return query;
}

// async function loginAndGetCookies( eenheidUri ) {
//   const response = await fetch(VENDOR_API_LOGIN, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({
//       organization: eenheidUri,
//       publisher: {
//         uri: VENDOR_URI,
//         key: VENDOR_KEY
//       }
//     })
//   });

//   // Extract and store cookies from the 'Set-Cookie' header
//   const cookies = response.headers.raw()['set-cookie'];
//   return cookies;
// }

// async function queryVendorApi( query, cookies ) {
//   const response = await fetch(VENDOR_API_SPARQL, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/x-www-form-urlencoded',
//       'Accept': 'application/sparql-results+json',
//       'Cookie': cookies.join(';')
//     },
//     body: `query=${encodeURIComponent(query)}`
//   });

//   const data = await response.json();
// }
