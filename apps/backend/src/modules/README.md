# Backend Modules — Contracts Pattern

Each module is a self-contained vertical (IAM, Admissions & Welfare, Finance, …)
with this layout:

```
modules/<name>/
  index.ts            # barrel — re-exports module class + contracts.ts ONLY
  contracts.ts        # public, typed surface (DI tokens + interfaces)
  <name>.module.ts    # NestJS @Module — exports the contract DI token
  controllers/        # HTTP/WS surface — internal
  services/           # business logic — internal
  repositories/       # data access — internal
  entities/           # types/persistence shapes — internal
```

**Rule:** a sibling module may import only `./modules/<other>` (the barrel),
which forwards `contracts.ts`. ESLint (`no-restricted-imports` +
`eslint-plugin-boundaries`) fails the build on any deep import. There is no
trusted caller — every contract method takes an `AuthContext` and the receiver
re-checks the required permission before executing.
