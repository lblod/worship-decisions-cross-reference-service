import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import {
  crossReferenceMappingsGemeente_EB,
  crossReferenceMappingsGemeente_CKB_EB
} from './config/cross-reference-mappings';

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

export async function getRelatedToCKB( eenheidUri ) {
  const queryStr = `
    SELECT DISTINCT ?ckb WHERE {
      ?ckb <http://www.w3.org/ns/org#hasSubOrganization> ${sparqlEscapeUri(eenheidUri)};
        a <http://data.lblod.info/vocabularies/erediensten/CentraalBestuurVanDeEredienst>.
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

export function getRelatedDecisionType( decisionType, hasCKB ) {
  // Mapping differs for some documents only if the bestuurseenheid has a CKB
  if (hasCKB) {
    return {
      ckbSpecificDecisionType: true,
      decisionType: crossReferenceMappingsGemeente_CKB_EB[decisionType]
    };
  } else {
    return {
      ckbSpecificDecisionType: false,
      decisionType: crossReferenceMappingsGemeente_EB[decisionType]
    };
  }
}

/*
  If the decision if of one of the two following types, it doesn't matter if there is a CKB in between the Gemeente
  and the EB even when the creator of the submission is a CKB.
  Those types allow cross references directly between Gemeente -> CKB and Gemeente -> EB.

  Types:
  - Schorsing beslissing eredienstbesturen
  - Opvragen bijkomende inlichtingen eredienstbesturen (met als gevolg stuiting termijn)
*/
export function isCkbRelevantForDecisionType(decisionType) {
  return decisionType != "https://data.vlaanderen.be/id/concept/BesluitDocumentType/24743b26-e0fb-4c14-8c82-5cd271289b0e"
    && decisionType != "https://data.vlaanderen.be/id/concept/BesluitType/b25faa84-3ab5-47ae-98c0-1b389c77b827";
}

export function ckbDecisionTypeToRelatedType(decisionType) {
  return crossReferenceMappingsGemeente_CKB_EB[decisionType];
}

export function isDecisionTypeFromCKB(decisionType) {
  // Trick: if the decision type is both in the keys AND in thevalues of `crossReferenceMappingsGemeente_CKB_EB`,
  // then it has to be a CKB decision type.
  return Object.values(crossReferenceMappingsGemeente_CKB_EB).some(e => e == decisionType)
    && crossReferenceMappingsGemeente_CKB_EB[decisionType];
}

export function prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionTypeData, forDecision }) {
  let query;

  if (decisionTypeData?.ckbSpecificDecisionType) {
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
          SELECT DISTINCT ?childDecision ?childDecisionTypeLabel ?ckbLabel ?what ?eredienst ?eredienstLabel WHERE {
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

            ${decisionTypeData.decisionType ?
              `
                  VALUES ?besluitType {
                    ${sparqlEscapeUri(decisionTypeData.decisionType)}
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

            ?betrokkenBestuur <http://www.w3.org/ns/org#organization> ?eredienst.
            ?eenheid <http://data.lblod.info/vocabularies/erediensten/betrokkenBestuur> ?betrokkenBestuur.

            ?ckb <http://www.w3.org/ns/org#hasSubOrganization> ?eredienst.

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

        ?mostRecentParentSubmission prov:generated/dcterms:relation ?childDecision;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
          mu:uuid ?submissionUuid.

        FILTER NOT EXISTS {
          ?otherParent prov:generated/dcterms:relation ?childDecision;
            <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?otherDateSent.

          FILTER(?otherDateSent > ?dateSent)
        }

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

       ${decisionTypeData?.decisionType ?
        `
            VALUES ?besluitType {
              ${sparqlEscapeUri(decisionTypeData.decisionType)}
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
        <http://data.lblod.info/id/besturenVanDeEredienst/5a04126b0c2c7b04bf3e01f69fffa936>
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
