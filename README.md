# worship-decisions-cross-reference-service

Service to retrieve related document information for decisions, enabling users to perform cross-referencing.

## Endpoints

### GET /search-documents

This endpoint looks for documents based on the provided query parameters.

#### Request

```
GET /search-documents
```

#### Query Parameters

- `forDecisionType`: (Optional) The type of decision to fetch related documents for.
- `forEenheid`: (Optional) The organizational unit to fetch related documents for.

Note: It will only work when the call goes through mu-identifier.

#### Usage Example
```
GET /search-documents?forDecisionType=someType&forEenheid=someEenheid
```

#### Response
- Status 200: Returns the related document information in Turtle format.
- Status 400: Returns an error message if required query parameters or headers are missing.
- Status 500: Returns an error message if an internal server error occurs.

### GET /document-information

This endpoint fetches document information based on the provided query parameters.

#### Request

```
GET /document-information
```

#### Query Parameters

- `forDecisionType`: (Optional) The type of decision to fetch related documents for.
- `forEenheid`: (Optional) The organizational unit to fetch related documents for.
- `forRelatedDecision`: (Optional) A specific decision URI, which will provide the extra info about the related decision .

Note: If `forRelatedDecision` is not provided, both `forDecisionType` and `forEenheid` are mandatory.

Note: It will only work when the call goes through mu-identifier.

#### Response

- Status 200: Returns the related document information in Turtle format.
- Status 400: Returns an error message if required query parameters or headers are missing.
- Status 500: Returns an error message if an internal server error occurs.

#### Usage Example
```
GET /document-information?forDecisionType=someType&forEenheid=someEenheid
```

## Enviroment variables

- `WORSHIP_DECISIONS_BASE_URL`: Base url where more information may be found about the related decision. It's a link to the connectected submission.
      Defaults to "https://databankerediensten.lokaalbestuur.vlaanderen.be/search/submissions/"
- `SCOPE_SUBMISSIONS_TO_ONE_GRAPH`: Force the submissions to come from the same graph. Mainly used for applications with a lot of graphs, to avoid query timeouts.
      Defaults to "false"

## Development Notes
The service checks if the organizational unit is related to a Centraal Bestuur.

Since it's sometimes a pain to find these, we allow, in development mode, that the service bypasses certain checks to ease testing and debugging.

To do so, in your `docker-compose.override.yml` put:
```
  worship-decisions-cross-reference:
    environment:
      BYPASS_HOP_CENTRAAL_BESTUUR: "true"
```
