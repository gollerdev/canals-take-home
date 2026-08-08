# Canals Order Management API

A REST API for placing orders. When an order arrives, it picks one warehouse that can ship all the
items, reserves the stock, charges the card and confirms the order. If anything fails, it releases
what it reserved and the customer is not charged.

Stack: NestJS, TypeScript, TypeORM, PostgreSQL with PostGIS.

---

## Contents

- [Philosophy](#philosophy)
- [Architecture and tech choices](#architecture-and-tech-choices)
- [Endpoints](#endpoints)
- [Local setup and testing](#local-setup-and-testing)
- [Examples](#examples)

---

## Philosophy

The functional part of this challenge is small: receive an order, find the closest warehouse that
has all the items, charge the card. A plain CRUD endpoint would satisfy those requirements and
still be the wrong answer.

This endpoint touches two things that cannot go wrong: inventory and someone else's money. On a
problem like this, the non functional requirements are as important as the functional ones. The
design therefore focuses on four properties.

**Retries are safe.** Every request requires an `Idempotency-Key` header. The order row is inserted
under a unique constraint on that key before any external call, so the insert itself is what
prevents duplicates. There is no gap between reading and writing where two retries can both decide
they are the first. A client that times out and repeats the request receives the same order back,
and the card is charged only once.

**Stock cannot be oversold.** Inventory moves in two phases, like a card authorization: reserve
first, then commit or release. The reservation is a single `UPDATE` with the check inside the
`WHERE` clause, so the database is what refuses to oversell rather than application logic. When two
orders compete for the last unit, Postgres evaluates that condition again after locking the row, so
the second one updates zero rows and moves on to the next warehouse. Orders with several products
always lock them in the same sequence, sorted by product id, so two concurrent orders cannot
deadlock each other.

**The customer is never charged for something that cannot ship.** Stock is reserved before the card
is charged, never the other way around. If the payment is declined or the provider fails, the
reservation is released and the order is recorded as failed. The customer does not pay for an order
that cannot be fulfilled, and stock is not left blocked by a payment problem.

**Errors are part of the API.** A declined card returns `402`, an order that no warehouse can fill
returns `409`, an invalid address returns `400`, and a provider that is down returns `503`. Each
response carries a reason the client can act on. Failed orders are still persisted with a
`failureReason` instead of being discarded. Nothing a client can trigger on purpose returns a `500`.

**The database decisions were made for scale, not for the demo.** With nine warehouses almost any
approach works; the goal was one that still holds at thousands.

Public estimates put the number of warehouse and storage locations in the United States, Canada and
Mexico at somewhere between 150,000 and 210,000. A company like Canals would never index all of
them, but even a small share of that market is tens of thousands of rows, and this query runs on
every order. The benchmarks below therefore use 200,000 warehouses rather than the nine in the demo.

There were three options.

The first is to calculate distances in the application: load every warehouse, measure each one, sort
the list. It works, but it moves the whole table into memory on every order and degrades every time
the company adds a warehouse.

The second is a SQL query with the distance formula inside `ORDER BY`. This is the common approach,
and Postgres has to calculate the distance for every row before it can sort, because the shipping
address differs on every request and there is nothing to index in advance. A normal index improves
this considerably: filter a box of latitude and longitude around the address first, and sort only
what falls inside. That is a legitimate solution, but the size of the box has to be chosen, and when
the box returns nothing it has to be widened and retried in application code.

The third option is PostGIS, the geographic extension for Postgres, and it is the one used here.
Measured on a laptop, median of 101 runs, warehouse selection only. The bounding box uses a
composite index on longitude and latitude, which was its fastest form:

| Approach                          | 10,000 warehouses | 200,000 warehouses | Rows read |
| --------------------------------- | ----------------- | ------------------ | --------- |
| Distance formula in `ORDER BY`    | 1.42 ms           | 19.4 ms            | 200,000   |
| Bounding box with composite index | 0.050 ms          | 1.42 ms            | 1,705     |
| PostGIS spatial index             | 0.039 ms          | 0.067 ms           | 1         |

The second column is the interesting one. At ten thousand warehouses the bounding box is almost as
fast as PostGIS, and at that size the extra dependency would be hard to justify. Multiplying the
data by 20 changes the picture: the direct query became 14 times slower, the bounding box 28 times
slower, and PostGIS only 1.7 times slower. At 200,000 warehouses PostGIS is roughly 290 times faster
than the direct query and 21 times faster than the best version of the bounding box.

The last column explains why. The direct query measures every warehouse in the country and discards
all but one. The bounding box narrows the field to 1,705 and measures those. The spatial index reads
exactly one row, because it can walk outward from the shipping address and stop at the first
warehouse that has everything.

This is CPU time on the hot path, paid on every order. At one thousand orders per second the direct
query would need around 19 seconds of CPU every second, so it would require dedicated machines just
to sort warehouses. PostGIS needs about 7% of one core.

PostGIS is also the accurate option. Postgres can sort by distance with an index without PostGIS,
and that is marginally faster, but it measures in degrees. A degree of longitude is not the same
distance as a degree of latitude, and the difference grows with distance from the equator. Near
Seattle, of two warehouses at 0.9 and 1.0 degrees, the one that looks closer in degrees is 100 km
away and the other is 75 km. Without PostGIS the query selects a warehouse 25 km further and calls
it the closest.

So PostGIS is faster than every option that is correct, and correct compared to the only option that
is faster. For a query that runs on every order and decides where a package ships from, neither
property is worth giving up.

The same reasoning applies elsewhere: prices are stored as integer cents rather than decimals so
rounding cannot drift, and schema changes ship as explicit migrations instead of letting the ORM
infer what changed.

---

## Architecture and tech choices

### The stack

**NestJS.** Provides modules, dependency injection and validation pipes out of the box. The
dependency injection is what allows the payment and geocoding providers to be replaced by mocks in
the tests without touching the order logic. It is also close to the stack Canals already uses.

**TypeScript in strict mode.** Everything is typed.

**TypeORM.** Entities, relations, transactions and migrations. It maps the PostGIS column type, so
warehouse locations are declared on the entity like any other column, but the query builder does not
cover PostGIS operators or set-returning functions. The closest-warehouse query needs `unnest` over
two parallel arrays as a table source, a correlated `NOT EXISTS`, and the `<->` distance operator,
none of which the builder can express. Going through it would mean passing that same SQL as raw
strings wrapped in extra code, so the query is written directly in SQL instead. The stock updates do
use the query builder, because the count of affected rows is what detects an order losing the race
for the last unit.

**PostgreSQL with PostGIS.** Covered above. In short, the closest-warehouse query stays correct and
fast as the number of warehouses grows.

**class-validator.** Validation of the HTTP body lives in the DTO, next to the type, so the rules
and the shape cannot drift apart.

**Jest against a real database.** The integration tests do not mock Postgres. Concurrency and
constraints, both central to this project, are precisely what a mock would get wrong.

### How a request flows

```
Controller  ->  Service  ->  Repository  ->  PostgreSQL
                   |
                   +-------->  PaymentGateway    (interface, mocked)
                   +-------->  GeocodingProvider (interface, mocked)
```

The controller deals only with HTTP: it validates the body, calls the service and selects the status
code. The service owns the business rules and the order of the steps. The repositories own the SQL.
Payment and geocoding are interfaces injected by token, so replacing a mock with a real provider
means writing one class and changing one line in the module.

Domain errors are thrown as typed exceptions and translated into HTTP status codes by a single
exception filter, so the services never import anything from HTTP.

### Folder structure

```
src/
  orders/         controller, service, repository, entities, DTOs, exceptions
  inventory/      warehouses, stock, the closest-warehouse query, reserve/commit/release
  products/       catalog lookups
  customers/      customer entity
  payments/       PaymentGateway interface and the mock implementation
  geocoding/      GeocodingProvider interface and the mock implementation
  database/       data source, migrations, seed
  common/         shared entities, types, and the HTTP exception filter
  config/         environment schema and validation
  health/         health check endpoint
test/             integration tests and their setup
```

Each domain folder is a Nest module and owns everything about that domain. Within them, one DTO per
file in a `dto/` folder and one exception per file in an `exceptions/` folder, so a class is always
where its name says it is.

---

## Endpoints

| Method | Path          | Description                                             |
| ------ | ------------- | ------------------------------------------------------- |
| `POST` | `/orders`     | Place an order. Needs an `Idempotency-Key` header.       |
| `GET`  | `/orders/:id` | Read an order with its items and the chosen warehouse.   |
| `GET`  | `/health`     | Returns `200` when the database is reachable.            |

`POST /orders` can respond with:

| Status | Meaning                                                       |
| ------ | ------------------------------------------------------------- |
| `201`  | Order confirmed                                                |
| `200`  | Replay of a previous request with the same key                 |
| `400`  | Invalid body, unknown product, or an address we cannot use     |
| `402`  | Card declined. The order is saved as failed and stock released |
| `404`  | Unknown customer                                               |
| `409`  | No warehouse can fill the order, or the same key is in flight  |
| `503`  | Payment or geocoding provider is unavailable                   |

The card number is never returned in the response.

---

## Local setup and testing

```bash
git clone <repository-url>
cd canals-take-home
docker compose up --build
```

You do not need a `.env` file. Every setting has a default inside `docker-compose.yml`.

Compose starts four containers in order, each one waiting for the previous to finish:

| Container | What it does                                                |
| --------- | ----------------------------------------------------------- |
| `db`      | PostgreSQL 17 + PostGIS 3.5, waits until `pg_isready` passes |
| `migrate` | Creates the schema from the migrations, then exits           |
| `seed`    | Loads customers, products, warehouses and stock, then exits  |
| `api`     | Serves the API on port 3000                                  |

The API is ready when this returns `200`:

```bash
curl -i http://localhost:3000/health
```

If port 3000 or 5433 is already used, run
`PORT=3001 DB_HOST_PORT=5434 docker compose up --build`. After pulling new code always add
`--build`, otherwise Docker serves the old image. To stop everything use `docker compose down`, or
`docker compose down -v` if you also want to delete the database so the next start seeds again from
zero.

### Tests

The tests need PostgreSQL but not the API container. They create their own database and run the
migrations into it automatically, and they never touch the one the running app uses.

```bash
docker compose up -d db
npm ci
npm test                    # 32 unit tests
npm run test:integration    # 123 integration tests
```

The integration tests boot the real application, with real dependency injection, real validation,
the real exception filter and a real PostgreSQL, and send requests to it over HTTP.

---

## Examples

The IDs below come from the seed data and never change, so you can copy these commands directly
without looking anything up first.

### The order goes to the closest warehouse that has everything

Ship to Manhattan and order only a t-shirt. `WH-NYC` is the closest warehouse and it has t-shirts:

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-nearest' \
  -d '{
    "customerId": "019fda00-0000-7000-8000-00000000c001",
    "cardNumber": "4242424242424242",
    "shippingAddress": {
      "line1": "350 Fifth Avenue", "city": "New York",
      "region": "NY", "postalCode": "10118", "country": "US"
    },
    "items": [
      { "productId": "019fda00-0000-7000-8000-000000000a01", "quantity": 2 }
    ]
  }'
```

Returns `201` with `"warehouse": { "code": "WH-NYC", ... }`.

### A closer warehouse is skipped when it cannot ship the whole order

Same address, but now add a navy cap. `WH-NYC` is a small city hub and it does not have caps, so
the complete order goes to Philadelphia instead. It is further away, but it can ship everything
together:

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-skips-nearest' \
  -d '{
    "customerId": "019fda00-0000-7000-8000-00000000c001",
    "cardNumber": "4242424242424242",
    "shippingAddress": {
      "line1": "350 Fifth Avenue", "city": "New York",
      "region": "NY", "postalCode": "10118", "country": "US"
    },
    "items": [
      { "productId": "019fda00-0000-7000-8000-000000000a01", "quantity": 2 },
      { "productId": "019fda00-0000-7000-8000-000000000a02", "quantity": 1 }
    ]
  }'
```

Returns `201` with `"warehouse": { "code": "WH-PHL", ... }`.

These two responses are the main point of the challenge. Same address and same closest warehouse,
but a different result, because the second order cannot be shipped from one place nearby.

### A declined card fails the order and releases the stock

The card `4000000000009995` always fails with insufficient funds:

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-declined' \
  -d '{
    "customerId": "019fda00-0000-7000-8000-00000000c001",
    "cardNumber": "4000000000009995",
    "shippingAddress": {
      "line1": "350 Fifth Avenue", "city": "New York",
      "region": "NY", "postalCode": "10118", "country": "US"
    },
    "items": [
      { "productId": "019fda00-0000-7000-8000-000000000a01", "quantity": 1 }
    ]
  }'
```

Returns `402` with `"failureReason": "payment_declined"`. The unit that was reserved goes back to
the warehouse, so the first example still works after this.

### Sending the same key twice does not create a second order

Run the first example again exactly as it is. The status changes from `201` to `200` and the `id`
is the same order as before, not a new one.
