import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';

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
  // TODO: wrap up the table once we have the full spec.
  // See: https://docs.google.com/spreadsheets/d/1DIQkJTCy3Z16xsZaE2QFOhXCQBDKS4ifeYV_592DxRw/edit?usp=sharing

  // If a CKB is involved, the decision types mapping is different. Check the rules.
  const mappingTableCKBSpecific = {
    // Advies bij jaarrekening eredienstbestuur
    "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
    // Gezamenlijk indienen van de jaarrekeningen van de besturen van de eredienst door het centraal bestuur van de eredienst.
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461",

    // Goedkeuringsbesluit Budget(wijziging)
    "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
    // Budgetten(wijzigingen) - Indiening bij toezichthoudende gemeente of provincie
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/ce569d3d-25ff-4ce9-a194-e77113597e29",

    // Goedkeuringsbesluit Meerjarenplan(wijziging)
    "https://data.vlaanderen.be/id/concept/BesluitType/3fcf7dba-2e5b-4955-a489-6dd8285c013b":
    // Meerjarenplannen(wijzigingen) van de besturen van de eredienst
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e"
  };

  const mappingTable = {
    // Advies bij jaarrekening eredienstbestuur
    "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
    // Jaarrekening.
    "https://data.vlaanderen.be/id/concept/BesluitType/e44c535d-4339-4d15-bdbf-d4be6046de2c",

    // Goedkeuringsbesluit Budget(wijziging)
    "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
    // Budget(wijziging) - Indiening bij toezichthoudende gemeente of provincie
    "https://data.vlaanderen.be/id/concept/BesluitType/d85218e2-a75f-4a30-9182-512b5c9dd1b2",

    // Goedkeuringsbesluit Meerjarenplan(wijziging)
    "https://data.vlaanderen.be/id/concept/BesluitType/3fcf7dba-2e5b-4955-a489-6dd8285c013b":
    // Meerjarenplan(aanpassing)
    "https://data.vlaanderen.be/id/concept/BesluitType/f56c645d-b8e1-4066-813d-e213f5bc529f",

    // Schorsingsbesluit
    "https://data.vlaanderen.be/id/concept/BesluitType/b25faa84-3ab5-47ae-98c0-1b389c77b827":
    // Notulen
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/8e791b27-7600-4577-b24e-c7c29e0eb773",

    // Stuiten
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/24743b26-e0fb-4c14-8c82-5cd271289b0e":
    // Notulen
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/8e791b27-7600-4577-b24e-c7c29e0eb773"
  };

  // Mapping differs for some documents only if bestuurseenheid has CKB. 
  if(mappingTableCKBSpecific[decisionType] && hasCKB) {
    return {
      ckbSpecificDdecisionType: true,
      decisionType: mappingTableCKBSpecific[decisionType]
    };
  }
  else {
    return {
      ckbSpecificDdecisionType: false,
      decisionType: mappingTable[decisionType]
    };
  }

}

export function prepareQuery( { fromEenheid, forEenheid, ckbUri, decisionTypeData, forDecision }) {
  let query;

  if(decisionTypeData.ckbSpecificDdecisionType) {
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

       ${decisionTypeData.decisionType ?
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
