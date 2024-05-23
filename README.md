# worship-decisions-cross-reference-service

Service to retrieve related document information for decisions, enabling users to perform cross-referencing.

## Endpoints

### GET /related-document-information

This endpoint fetches related document information based on the provided query parameters.

#### Request
```
GET /related-document-information
```
#### Query Parameters

- `forDecisionType`: (Optional) The type of decision to fetch related documents for.
- `forEenheid`: (Optional) The organizational unit to fetch related documents for.
- `forRelatedDecision`: (Optional) A specific decision URI, which will provide the extra info about the related decisbion .

Note: If `forRelatedDecision` is not provided, both `forDecisionType` and `forEenheid` are mandatory.

Note: It will only work when the call goes through mu-identifier.
#### Response

- Status 200: Returns the related document information in Turtle format.
- Status 400: Returns an error message if required query parameters or headers are missing.
- Status 500: Returns an error message if an internal server error occurs.

## Usage Example
```
GET /related-document-information?forDecisionType=someType&forEenheid=someEenheid
```
### Response

Turtle formatted response with related document information.

## Development Notes
The service checks if the organizational unit is related to a CKB (Centraal Kerkbestuur).

Since we don't have this data yet, we allow, in development mode, that the service bypasses certain checks to ease testing and debugging.

To do so, in your `docker-compose.override.yml` put:
```
  worship-decisions-cross-reference:
    environment:
      NODE_ENV: "development"
```
