# Worship Decisions Cross-Reference Service

This repository contains the code for the `worship-decisions-cross-reference-service`, a Node.js application that provides a service for cross-referencing worship decisions. The service exposes endpoints to fetch related document information based on decision types and organizational units.

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
- `forDecision`: (Optional) A specific decision URI to fetch related documents for.

Note: If `forDecision` is not provided, both `forDecisionType` and `forEenheid` are mandatory.
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

- The service checks if the organizational unit is related to a CKB (central knowledge base).
  - Since we don't have this data yet, we allow, in development mode, that the service bypasses certain checks to facilitate testing and debugging.
