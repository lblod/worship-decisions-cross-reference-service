import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';

const WORSHIP_DECISIONS_BASE_URL = process.env.WORSHIP_DECISIONS_BASE_URL
      || "https://databankerediensten.lokaalbestuur.vlaanderen.be/search/submissions/";

const SCOPE_SUBMISSIONS_TO_ONE_GRAPH = process.env.SCOPE_SUBMISSIONS_TO_ONE_GRAPH == 'true' ? true : false ;

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

export async function getRelatedToActiveCKB( eenheidUri ) {
  const queryStr = `
    SELECT DISTINCT ?ckb WHERE {
      ?ckb <http://www.w3.org/ns/org#hasSubOrganization> ${sparqlEscapeUri(eenheidUri)};
        a <http://data.lblod.info/vocabularies/erediensten/CentraalBestuurVanDeEredienst>;
        <http://www.w3.org/ns/regorg#orgStatus> <http://lblod.data.gift/concepts/63cc561de9188d64ba5840a42ae8f0d6>.
    }
  `;
  const result = (await querySudo(queryStr))?.results?.bindings || [];
  return result[0] ? result[0].ckb.value : null;
}

export async function getEenheidForDecision( decisionUri ) {
  const queryStr = `
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT DISTINCT ?eenheid WHERE {
      ?submission dcterms:subject ${sparqlEscapeUri(decisionUri)};
        <http://purl.org/pav/createdBy> ?eenheid.
    }
  `;

  const result = (await querySudo(queryStr))?.results?.bindings || [];
  return result[0] ? result[0].eenheid.value : null;
}

export async function getReferredDecisionType(referrerDecisionType, withCKB) {
  const predicate = withCKB ? 'ext:can_refer_to' : 'ext:without_relevant_CKB_can_refer_to';
  const response = await querySudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?referredDecisionType
    WHERE {
      BIND (${sparqlEscapeUri(referrerDecisionType)} AS ?referrerDecisionType)
      ?referrerDecisionType ${predicate} ?referredDecisionType .
    }
    LIMIT 1
  `);
  if (response?.results?.bindings?.length) {
    return response.results.bindings[0].referredDecisionType.value;
  }
}

// A decision type is CKB-relevant if it has a with-CKB mapping in the
// triplestore. Types without an `ext:can_refer_to` predicate (e.g. Schorsing,
// Opvragen bijkomende inlichtingen) refer directly between Gemeente and EB
// regardless of whether a CKB sits in between.
export async function isCkbRelevantForDecisionType(decisionType) {
  const response = await querySudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    ASK {
      ${sparqlEscapeUri(decisionType)} ext:can_refer_to ?referredDecisionType .
    }
  `);
  return response.boolean;
}

export async function isDecisionTypeFromCKB(decisionType) {
  // Trick: if the decision type both refers to another type and is being
  // referred to from a type, then it has to be a CKB decision type.
  const response = await querySudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    ASK {
      BIND (${sparqlEscapeUri(decisionType)} AS ?decisionType)
      ?decisionType ext:can_refer_to ?otherType1 .
      ?otherType2 ext:can_refer_to ?decisionType .
    }
  `);
  return response.boolean;
}

export function prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionType, forDecision }) {
  let query;

  if (!!ckbUri) {
    query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov: <http://www.w3.org/ns/prov#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      CONSTRUCT {
        ?childDecision a ?what;
          skos:prefLabel ?displayLabel;
          <http://purl.org/pav/createdBy> ?eredienst;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
          rdfs:seeAlso ?seeAlsoUrl.

          ?eredienst skos:prefLabel ?niceIngezondenDoor.
      }
      WHERE {
        {
          SELECT DISTINCT ?childDecision ?childDecisionTypeLabel ?ckbLabel ?what ?eredienst ?eredienstLabel ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `?g`: ''}
          WHERE {
            ${fromEenheid ?
              `
                  VALUES ?eenheid {
                    ${sparqlEscapeUri(fromEenheid)}
                  }
              `: ''
            }

            ${forEenheid ?
              `
                  VALUES ?eredienst {
                    ${sparqlEscapeUri(forEenheid)}
                  }
              `: ''
            }

            ${decisionType ?
              `
                  VALUES ?besluitType {
                    ${sparqlEscapeUri(decisionType)}
                  }
                `: ''
            }

            ${forDecision ?
              `
                  VALUES ?childDecision {
                    ${sparqlEscapeUri(forDecision)}
                  }
                `: ''
            }

            ${ckbUri ?
              `
                  VALUES ?ckb {
                    ${sparqlEscapeUri(ckbUri)}
                  }
                `: ''
            }

            FILTER EXISTS {
              ?betrokkenBestuur <http://www.w3.org/ns/org#organization> ?eredienst.
              ?eenheid <http://data.lblod.info/vocabularies/erediensten/betrokkenBestuur> ?betrokkenBestuur.

              ?ckb <http://www.w3.org/ns/org#hasSubOrganization> ?eredienst.
            }

            ?eredienst skos:prefLabel ?eredienstLabel.
            ?ckb skos:prefLabel ?ckbLabel.
            ?besluitType skos:prefLabel ?besluitTypeLabel.

            ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `GRAPH ?g {`: ''}

              ?submission a <http://rdf.myexperiment.org/ontologies/base/Submission>;
                <http://purl.org/pav/createdBy> ?ckb;
                prov:generated ?formData.

              ?formData
                dcterms:type ?besluitType;
                dcterms:relation ?childDecision.

              ?childSubmission dcterms:subject ?childDecision;
                  <http://purl.org/pav/createdBy> ?eredienst;
                  prov:generated ?childFormData.

              ?childFormData <http://mu.semte.ch/vocabularies/ext/decisionType> ?childDecisionType.

              ?childDecisionType skos:prefLabel ?childDecisionTypeLabel.

              ?childDecision a ?what.

            ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `}`: ''}
          }
        }

        ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `GRAPH ?g {`: ''}

          ?mostRecentParentSubmission prov:generated/dcterms:relation ?childDecision;
            <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
            mu:uuid ?submissionUuid.

          FILTER NOT EXISTS {
            ?otherParent prov:generated/dcterms:relation ?childDecision;
              <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?otherDateSent.

            FILTER(?otherDateSent > ?dateSent)
          }

        ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `}`: ''}

        BIND(CONCAT(?ckbLabel, " namens ", ?eredienstLabel) as ?niceIngezondenDoor)

        BIND(IRI(CONCAT("${WORSHIP_DECISIONS_BASE_URL}", STR(?submissionUuid))) as ?seeAlsoUrl)

        BIND(STRBEFORE(STR(?dateSent), "T") AS ?niceDateSent)
        BIND(CONCAT(?childDecisionTypeLabel, " van ", ?eredienstLabel, " als laatste gebundeld en verstuurd door ", ?ckbLabel,
                    " op ", ?niceDateSent) as ?displayLabel)
      }`;
  }
  else {
    query = `

      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov: <http://www.w3.org/ns/prov#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      CONSTRUCT {
        ?subject a ?what;
          skos:prefLabel ?displayLabel;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
          <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime> ?sessionStarted;
          <http://purl.org/pav/createdBy> ?eredienst;
          rdfs:seeAlso ?seeAlsoUrl.

          ?eredienst skos:prefLabel ?eredienstLabel.
      }
      WHERE {

       ${fromEenheid ?
        `
            VALUES ?eenheid {
              ${sparqlEscapeUri(fromEenheid)}
            }
           `: ''
      }

       ${forEenheid ?
        `
            VALUES ?eredienst {
              ${sparqlEscapeUri(forEenheid)}
            }
           `: ''
      }

       ${decisionType ?
        `
            VALUES ?besluitType {
              ${sparqlEscapeUri(decisionType)}
            }
          `: ''
      }

       ${forDecision ?
        `
            VALUES ?subject {
              ${sparqlEscapeUri(forDecision)}
            }
          `: ''
      }

        ?betrokkenBestuur <http://www.w3.org/ns/org#organization> ?eredienst.
        ?eenheid <http://data.lblod.info/vocabularies/erediensten/betrokkenBestuur> ?betrokkenBestuur.

        ?eredienst skos:prefLabel ?eredienstLabel.

        ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `GRAPH ?g {`: ''}

          ?submission a <http://rdf.myexperiment.org/ontologies/base/Submission>;
            mu:uuid ?submissionUuid;
            <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
            dcterms:subject ?subject;
            <http://purl.org/pav/createdBy> ?eredienst;
            prov:generated ?formData.

          ?subject a ?what.

          ?formData
            <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime>
              |
              <http://mu.semte.ch/vocabularies/ext/sessionStartedAtTime> ?sessionStarted;
            dcterms:type ?besluitType.

        ${SCOPE_SUBMISSIONS_TO_ONE_GRAPH ? `}`: ''}

        ?besluitType skos:prefLabel ?besluitTypeLabel.

        BIND(IRI(CONCAT("${WORSHIP_DECISIONS_BASE_URL}", STR(?submissionUuid))) as ?seeAlsoUrl)

        BIND(STRBEFORE(STR(?dateSent), "T") AS ?niceDateSent)
        BIND(STRBEFORE(STR(?sessionStarted), "T") AS ?niceSessionStarted)
        BIND(CONCAT(?besluitTypeLabel, " verstuurd op ", ?niceDateSent, " voor zittingsdatum ", ?niceSessionStarted) as ?displayLabel)
      }
    `;
  }

  return query;
}

export function prepareCKBSearchQuery({ fromEenheid, forEenheid, decisionType }) {
  return `
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    CONSTRUCT {
      ?subject a ?what;
        skos:prefLabel ?displayLabel ;
        <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent ;
        <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime> ?sessionStarted ;
        <http://purl.org/pav/createdBy> ?forEenheid ;
        rdfs:seeAlso ?seeAlsoUrl .

        ?forEenheid skos:prefLabel ?eredienstLabel .
    } WHERE {
      VALUES ?forEenheid {
        ${sparqlEscapeUri(forEenheid)}
      }

      VALUES ?fromEenheid {
        ${sparqlEscapeUri(fromEenheid)}
      }

      VALUES ?besluitType {
        ${sparqlEscapeUri(decisionType)}
      }

      ?fromEenheid <http://www.w3.org/ns/org#hasSubOrganization> ?forEenheid .

      ?submission a <http://rdf.myexperiment.org/ontologies/base/Submission> ;
      mu:uuid ?submissionUuid ;
      <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent ;
      dcterms:subject ?subject ;
      <http://purl.org/pav/createdBy> ?forEenheid ;
      prov:generated ?formData .

      ?forEenheid skos:prefLabel ?eredienstLabel .

      ?subject a ?what .

      ?formData
        <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime>
          |
          <http://mu.semte.ch/vocabularies/ext/sessionStartedAtTime>  ?sessionStarted ;

        dcterms:type ?besluitType .

      ?besluitType skos:prefLabel ?besluitTypeLabel .

      BIND(IRI(CONCAT("${WORSHIP_DECISIONS_BASE_URL}", STR(?submissionUuid))) as ?seeAlsoUrl)
      BIND(STRBEFORE(STR(?dateSent), "T") AS ?niceDateSent)
      BIND(STRBEFORE(STR(?sessionStarted), "T") AS ?niceSessionStarted)
      BIND(CONCAT(?besluitTypeLabel, " verstuurd op ", ?niceDateSent, " voor zittingsdatum ", ?niceSessionStarted) as ?displayLabel)
    }
  `;
}

export async function isCKB(eenheidUri) {
  const queryStr = `
    ASK {
      ${sparqlEscapeUri(eenheidUri)} a <http://data.lblod.info/vocabularies/erediensten/CentraalBestuurVanDeEredienst> .
    }`

  return (await querySudo(queryStr)).boolean;
}

export async function isGemeente(eenheidUri) {
  const queryStr = `
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>

    ASK {
      ${sparqlEscapeUri(eenheidUri)} besluit:classificatie|org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001> .
    }`

  return (await querySudo(queryStr)).boolean;
}
