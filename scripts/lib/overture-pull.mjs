// The one query that pulls Singapore's places out of an Overture Maps release
// (public S3 bucket, read through DuckDB). Needs the root devDependency @duckdb/node-api.
import { DuckDBInstance } from '@duckdb/node-api'

// Singapore bounding box; rows tagged with another country are dropped in SQL below.
const BBOX = { xmin: 103.6, xmax: 104.1, ymin: 1.13, ymax: 1.5 }
const BUCKET = 's3://overturemaps-us-west-2/release'
const RELEASE = /^\d{4}-\d{2}-\d{2}\.\d+$/ // e.g. 2026-10-21.0

async function connect() {
  const instance = await DuckDBInstance.create(':memory:')
  const con = await instance.connect()
  await con.run('INSTALL httpfs; LOAD httpfs;')
  await con.run("SET s3_region='us-west-2';")
  return con
}

// The newest release in Overture's bucket. It keeps only the last couple of months.
export async function latestRelease(con) {
  const rows = await (
    await con.run(
      "SELECT DISTINCT regexp_extract(file, 'release/([^/]+)/', 1) AS rel " +
        `FROM glob('${BUCKET}/*/theme=places/type=place/*') ORDER BY rel DESC LIMIT 1`,
    )
  ).getRows()
  return rows[0][0]
}

// Every Singapore place in a release (the latest by default): food or not, open or
// not, at any confidence. `isFood` and `status` let the caller decide what to keep.
// Categories come from `taxonomy`; Overture dropped the old `categories` column.
export async function pullRelease(release) {
  if (release !== undefined && !RELEASE.test(release)) {
    throw new Error(`"${release}" isn't a release name; they look like 2026-10-21.0`)
  }
  const con = await connect()
  const rel = release ?? (await latestRelease(con))
  const result = await con.run(`
    SELECT to_json(struct_pack(
      gersId := id,
      name := names.primary,
      lat := bbox.ymin,
      lon := bbox.xmin,
      categoryPrimary := taxonomy.primary,
      categoryPath := taxonomy.hierarchy,
      categoriesAlternate := taxonomy.alternates,
      address := addresses[1].freeform,
      postcode := addresses[1].postcode,
      phone := phones[1],
      website := websites[1],
      social := socials[1],
      brand := brand.names."primary",
      confidence := round(confidence, 3),
      updatedAt := list_max(list_transform(sources, s -> s.update_time)),
      isFood := coalesce(list_contains(taxonomy.hierarchy, 'food_and_drink') OR taxonomy.primary = 'food_and_drink', false),
      status := operating_status
    )) AS j
    FROM read_parquet('${BUCKET}/${rel}/theme=places/type=place/*', hive_partitioning=1)
    WHERE bbox.xmin >= ${BBOX.xmin} AND bbox.xmax <= ${BBOX.xmax}
      AND bbox.ymin >= ${BBOX.ymin} AND bbox.ymax <= ${BBOX.ymax}
      AND (addresses[1].country IS NULL OR addresses[1].country = 'SG')
  `)
  return { release: rel, rows: (await result.getRows()).map((r) => JSON.parse(r[0])) }
}
