import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';

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
  // Query the database with query
  // if not found return null else the URI
    return null; // or the CKB URI
}

export function getRelatedDecisionType( decisionType, hasCKB ) {
  // TODO: wrap up the table once we have the full spec.
  // See: https://docs.google.com/spreadsheets/d/1DIQkJTCy3Z16xsZaE2QFOhXCQBDKS4ifeYV_592DxRw/edit?usp=sharing
  if(hasCKB) {
    const mappingTable = {
      // Advies bij jaarrekening eredienstbestuur
      "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
      // Gezamenlijk indienen van de jaarrekeningen van de besturen van de eredienst door het centraal bestuur van de eredienst.
      "https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461",

      // Goedkeuringsbesluit Budget(wijziging)
      "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
      // Budgetten(wijzigingen) - Indiening bij toezichthoudende gemeente of provincie
      "https://data.vlaanderen.be/doc/concept/BesluitDocumentType/18833df2-8c9e-4edd-87fd-b5c252337349",

      // Goedkeuringsbesluit Meerjarenplan(wijziging)
      "https://data.vlaanderen.be/doc/concept/BesluitType/3fcf7dba-2e5b-4955-a489-6dd8285c013b":
      // Meerjarenplannen(wijzigingen) van de besturen van de eredienst
      "https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e"
    };
    return mappingTable[decisionType];
  }
  else {
    const mappingTable = {
      // Advies bij jaarrekening eredienstbestuur
      "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
      // Jaarrekening.
      "https://data.vlaanderen.be/id/concept/BesluitType/e44c535d-4339-4d15-bdbf-d4be6046de2c",

      // Goedkeuringsbesluit Budget(wijziging)
      "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
      // Budget(wijziging) - Indiening bij toezichthoudende gemeente of provincie
      "https://data.vlaanderen.be/doc/concept/BesluitType/40831a2c-771d-4b41-9720-0399998f1873",

      // Goedkeuringsbesluit Meerjarenplan(wijziging)
      "https://data.vlaanderen.be/doc/concept/BesluitType/3fcf7dba-2e5b-4955-a489-6dd8285c013b":
      // Meerjarenplan(aanpassing)
      "https://data.vlaanderen.be/doc/concept/BesluitType/f56c645d-b8e1-4066-813d-e213f5bc529f",

      // Schorsingsbesluit
      "https://data.vlaanderen.be/doc/concept/BesluitType/b25faa84-3ab5-47ae-98c0-1b389c77b827":
      // Notulen
      "https://data.vlaanderen.be/id/concept/BesluitDocumentType/8e791b27-7600-4577-b24e-c7c29e0eb773",

      // Stuiten
      "https://data.vlaanderen.be/doc/concept/BesluitDocumentType/24743b26-e0fb-4c14-8c82-5cd271289b0e":
      // Notulen
      "https://data.vlaanderen.be/id/concept/BesluitDocumentType/8e791b27-7600-4577-b24e-c7c29e0eb773"

    };
    return mappingTable[decisionType];
  }
}

export function prepareQuery(fromEenheid, forEenheid, ckbUri, decisionType ) {
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
        ?subject a ?what;
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

          ?subject a ?what.

          ?formData
            <http://lblod.data.gift/vocabularies/besluit/submission/form-data/sessionStartedAtTime>
              |
              <http://mu.semte.ch/vocabularies/ext/sessionStartedAtTime>	 ?sessionStarted;

            dcterms:type ?besluitType.

          ?besluitType skos:prefLabel ?besluitTypeLabel.

          BIND(STRBEFORE(STR(?dateSent), "T") AS ?niceDateSent)
          BIND(STRBEFORE(STR(?sessionStarted), "T") AS ?niceSessionStarted)
          BIND(CONCAT(?besluitTypeLabel, " verstuurd op ", ?niceDateSent, " voor zittingsdatum ", ?niceSessionStarted) as ?displayLabel)
      }
    `;
  }

  return query;
}
