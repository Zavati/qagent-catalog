# QAgent — Foundation 07.7.2-A FIX-2 — Observed Auth Signal Bridge (Catalog)

## Objetivo

Aceitar, persistir e expor no Evidence Ledger somente os fatos sanitizados de autenticação produzidos pelo Processing Plane.

## Catalog Update v1

`qagent.catalog-update.v1` continua sendo o contrato. Foram adicionados campos opcionais aditivos em `observation`:

```json
{
  "authObserved": true,
  "authScheme": "BEARER"
}
```

Valores aceitos para `authScheme`: `BEARER`, `BASIC`, `API_KEY`, `COOKIE`, `UNKNOWN`.

Invariantes:

- campos ausentes: source legado/unknown;
- `authObserved=false` => `authScheme=null`/ausente;
- `authObserved=true` => `authScheme` obrigatório;
- campos inesperados como `authorization` continuam rejeitados pelo boundary estrito.

## D1

Migration `0012_observed_auth_signal.sql` adiciona:

- `auth_observed`
- `auth_scheme`

à tabela `catalog_ingestion_events` e republica esses campos no view `catalog_evidence_v1`.

## Query API

`GET /v1/catalog/endpoints/:endpointId/evidence` passa a retornar opcionalmente:

```json
{
  "authObserved": true,
  "authScheme": "BEARER"
}
```

`authObserved` é serializado como boolean JSON, não `0/1`, para consumo do Gateway.

## Segurança

O Catalog nunca recebe nem persiste credential values. O contrato continua rejeitando payloads com headers/tokens crus.
