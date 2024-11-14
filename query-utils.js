import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import {
  crossReferenceMappingsGemeente_EB,
  crossReferenceMappingsGemeente_CKB_EB
} from './config/cross-reference-mappings';

const WORSHIP_DECISIONS_BASE_URL = process.env.WORSHIP_DECISIONS_BASE_URL
      || "https://databankerediensten.lokaalbestuur.vlaanderen.be/search/submissions/";

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
  // Mapping differs for some documents only if bestuurseenheid has CKB. 
  if (hasCKB) {
    return {
      ckbSpecificDdecisionType: true,
      decisionType: crossReferenceMappingsGemeente_CKB_EB[decisionType]
    };
  }
  else {
    return {
      ckbSpecificDdecisionType: false,
      decisionType: crossReferenceMappingsGemeente_EB[decisionType]
    };
  }
}

export function ckbDecisionTypeToRelatedType(decisionType) {
  return crossReferenceMappingsGemeente_CKB_EB[decisionType];
}

export function prepareQuery({ fromEenheid, forEenheid, ckbUri, decisionTypeData, forDecision }) {
  let query;

  if (decisionTypeData?.ckbSpecificDdecisionType) {
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


        ?submission a <http://rdf.myexperiment.org/ontologies/base/Submission>;
          mu:uuid ?submissionUuid;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
          dcterms:subject ?subject;
          <http://purl.org/pav/createdBy> ?ckb;
          prov:generated ?formData.

          ?eredienst skos:prefLabel ?eredienstLabel.
          ?ckb skos:prefLabel ?ckbLabel.


          ?formData
            dcterms:type ?besluitType;
            dcterms:relation ?childDecision.

          ?besluitType skos:prefLabel ?besluitTypeLabel.

          ?childSubmission dcterms:subject ?childDecision;
               <http://purl.org/pav/createdBy> ?eredienst;
               prov:generated ?childFormData.

          ?childFormData <http://mu.semte.ch/vocabularies/ext/decisionType> ?childDecisionType.

          ?childDecisionType skos:prefLabel ?childDecisionTypeLabel.

          ?childDecision a ?what.

          BIND(CONCAT(?ckbLabel, " namens ", ?eredienstLabel) as ?niceIngezondenDoor)

          BIND(IRI(CONCAT("${WORSHIP_DECISIONS_BASE_URL}", STR(?submissionUuid))) as ?seeAlsoUrl)

          BIND(STRBEFORE(STR(?dateSent), "T") AS ?niceDateSent)
          BIND(CONCAT(?childDecisionTypeLabel, " van ", ?eredienstLabel, " gebundeld en verstuurd door ", ?ckbLabel,
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

        ?submission a <http://rdf.myexperiment.org/ontologies/base/Submission>;
          mu:uuid ?submissionUuid;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#sentDate> ?dateSent;
          dcterms:subject ?subject;
          <http://purl.org/pav/createdBy> ?eredienst;
          prov:generated ?formData.

          ?eredienst skos:prefLabel ?eredienstLabel.

          ?subject a ?what.

          ?formData
            <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime>
              |
              <http://mu.semte.ch/vocabularies/ext/sessionStartedAtTime>	 ?sessionStarted;

            dcterms:type ?besluitType.

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
