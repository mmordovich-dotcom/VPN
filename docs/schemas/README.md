# Render schema snapshot

`render.schema.json` downloaded unchanged on 2026-10-15 from the official endpoint:
https://render.com/schema/render.yaml.json

Render documents this schema at https://render.com/docs/blueprint-spec .
`pnpm cloud:validate` checks this snapshot offline using Ajv 2020 and parses YAML 1.2.
This is structural validation, not validation by the authenticated Render API or a deployment to a specific account. Check the current Dashboard before publishing.
