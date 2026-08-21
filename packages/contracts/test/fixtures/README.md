# Captured producer responses

Real responses, saved so a schema is tested against what a producer sends
rather than against what the schema's author assumed it sends. That distinction
is not academic: `StakeholderClientSchema` typed `contact` as a full stakeholder
row for two releases, the Astro producer has always sent a bare name string, and
every test agreed with the schema because every test was written from it.

## `stakeholders-astro.json`

`GET team.alpina.solutions/api/stakeholders.json`, captured 2026-08-21 by
building the site (`astro build`, output `static`, so the route prerenders to a
file) and reading `dist/client/api/stakeholders.json`.

**Names, addresses and client names are placeholders.** The capture carried real
client contacts, so every person name became `Person One`, every address
`person-one@example.com`, and every client `Client One`, including the mentions
inside `source` and `note` prose. Nothing else was touched: key order, which
optional keys each row carries, the null-versus-absent distinction and the
`counts` totals are exactly as the producer emitted them. The value of the file
is its shape, and the shape is untouched.
